import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Set payload limit to 50MB to handle large PDF / scanned invoice files
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lazy initialize GoogleGenAI
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables.');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Helper for delay with exponential backoff and jitter
const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 200));

// Candidate models in order of stability, throughput and quality
const CANDIDATE_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-3.1-pro-preview',
];

// Helper to call Gemini with multi-cycle fallback across candidate models
async function generateInvoiceContentWithFallback(
  base64Data: string,
  mimeType: string,
  fileName: string,
  systemPrompt: string,
  responseSchema: any
) {
  const ai = getGeminiClient();
  let lastError: any = null;
  const maxRounds = 2;

  for (let round = 1; round <= maxRounds; round++) {
    for (const modelName of CANDIDATE_MODELS) {
      try {
        console.log(
          `[Gemini OCR] Tur ${round}/${maxRounds} - Model deneniyor: ${modelName}...`
        );

        const response = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType:
                    mimeType === 'application/pdf' ? 'application/pdf' : mimeType,
                },
              },
              {
                text: `Bu fatura belgesi (${fileName || 'fatura'}) tek veya birden fazla sayfadan (çok sayfalı PDF) oluşuyor olabilir. Lütfen belgenin 1. sayfasından başlayarak EN SON SAYFASINA KADAR TÜM SAYFALARDAKİ bütün mal, ürün ve hizmet satırlarını eksiksiz tara ve tek bir JSON listesinde ('items') topla. Hiçbir sayfayı ve hiçbir ürün satırını atlama. Üst bilgileri ve son sayfadaki genel toplamları (Matrah, KDV, Ödenecek Tutar) alarak JSON şemasına uygun şekilde yanıt ver.`,
              },
            ],
          },
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema,
            maxOutputTokens: 16384,
          },
        });

        if (response && response.text) {
          console.log(`[Gemini OCR] Başarılı model: ${modelName} (Tur ${round})`);
          return { modelUsed: modelName, text: response.text };
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        console.warn(
          `[Gemini OCR] Tur ${round} - Model ${modelName} yanıt veremedi:`,
          errMsg
        );
        // Exponential backoff before switching or retrying
        const backoffTime = 600 * round + Math.floor(Math.random() * 400);
        await wait(backoffTime);
      }
    }
  }

  throw (
    lastError ||
    new Error('Yapay zeka modelleri geçici yoğunluk yaşıyor. Lütfen tekrar deneyin.')
  );
}

// Invoice parsing endpoint
app.post('/api/parse-invoice', async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName, availableCategories } = req.body;

    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: 'fileBase64 and mimeType are required' });
    }

    // Clean base64 string if it contains prefix
    const base64Data = fileBase64.replace(/^data:[^;]+;base64,/, '');

    const validCategories: string[] =
      Array.isArray(availableCategories) && availableCategories.length > 0
        ? availableCategories
        : [
            'Kırtasiye',
            'Donanım & Bilişim',
            'Yazılım & Lisans',
            'Sarf Malzeme',
            'Elektronik',
            'Hizmet & Danışmanlık',
            'Temizlik & Hijyen',
            'Gıda & Mutfak',
            'Mobilya & Ofis',
            'Lojistik & Kargo',
            'Bakım & Onarım',
            'Hammadde & Üretim',
            'Genel Gider',
            'Diğer',
          ];

    const categoryListStr = validCategories.join(', ');

    const systemPrompt = `Sen Türkiye e-Fatura, e-Arşiv, A4 kağıt fatura, irsaliyeli fatura ve perakende satış fişi formatlarına mükemmel derecede hakim, uzman bir muhasebe ve OCR veri çıkarma asistanısın.

GÖREVİN:
Sana verilen PDF veya görsel fatura belgesini inceleyip:
1. Fatura başlık ve üst bilgilerini (Fatura No, Tarih, Düzenleme Saati, Fatura Türü, ETTN No, Satıcı Ünvanı, Satıcı VKN/TCKN, Alıcı Ünvanı, Alıcı VKN/TCKN, Para Birimi, Matrah, Toplam İskonto, Toplam KDV, Ödenecek Genel Tutar, Notlar) eksiksiz çıkar.
2. Faturadaki TÜM MAL, ÜRÜN VE HİZMET SATIRLARINI TEK TEK ayıkla.
   Her bir satır için:
   - siraNo: Satır numarası (1, 2, 3...)
   - urunHizmetAdi: Malın / Ürünün / Hizmetin tam adı
   - urunKodu: Varsa stok/ürün/hizmet kodu veya barkodu
   - aciklama: Varsa ek açıklama, marka, model, seri no veya detaylar
   - miktar: Miktar (sayısal değer, örn: 1, 10.5, 250)
   - birim: Birim tipi (örn: "Adet", "Kg", "Litre", "Metre", "Paket", "Koli", "Gün", "Saat", "Ay", "Kutu", "Ton", "m²", "m³", "Plaka", vb.)
   - birimFiyat: İSKONTOLU NET BİRİM FİYAT (sayısal, KDV hariç)
   - iskontoOrani: Varsa iskonto yüzdesi (örn: 5, 10 veya 25, yoksa 0)
   - iskontoTutari: Varsa iskonto tutarı (sayısal, yoksa 0)
   - kdvOrani: KDV oranı yüzdesi (örn: 20, 10, 1, 0)
   - kdvTutari: Bu satıra ait KDV tutarı (sayısal)
   - satirToplami: Satırın KDV hariç net mal/hizmet tutarı (sayısal)
   - kategori: Ürünün Mizan kategorisi. DİKKAT: Kategori SADECE ve MUTLAKA şu Mizan kategorilerinden biri olmalıdır: [${categoryListStr}]. Başka hiçbir kategori oluşturma veya uydurma.
   - paraBirimi: Satırın para birimi (TRY, USD, EUR vb.)

İSKONTO VE BİRİM FİYAT HESAPLAMA KURALLARI (ÇOK ÖNEMLİ):
1. Faturadaki satırda iskonto oranı (iskontoOrani) veya iskonto tutarı (iskontoTutari) varsa:
   - 'birimFiyat' değerini İSKONTOLU NET BİRİM FİYAT olarak belirle.
   - Formül: Net Birim Fiyat = Liste Fiyatı * (1 - İskonto Oranı / 100) VEYA Liste Fiyatı - (İskonto Tutarı / Miktar).
2. Eğer satırda iskonto oranı açıkça yazılamıyorsa veya liste fiyatından emin olunamıyorsa:
   - Satırdaki net Mal/Hizmet Tutarını (satirToplami) miktara (miktar) bölerek birim fiyatı belirle:
     birimFiyat = satirToplami / miktar.
3. 'birimFiyat' alanı her zaman faturadaki nihai gerçek net birim maliyeti yansıtmalıdır.

ÇOK SAYFALI (MULTI-PAGE) PDF FATURALARI (ÇOK ÖNEMLİ):
- PDF belgesi 2, 3, 5 veya daha fazla sayfadan oluşabilir.
- BELGENİN 1. SAYFASINDAN İTİBAREN EN SON SAYFASINA KADAR TÜM SAYFALARINI EKSİKSİZ TARA.
- 1. sayfadaki ürünlerle yetinme; 2., 3. ve sonraki devam sayfalarındaki TÜM ürün/hizmet satırlarını tek tek sırayla 'items' dizisine ekle.
- Hiçbir sayfayı ve hiçbir ara satırı atlama.
- Üst başlık bilgilerini (Fatura No, Tarih, Satıcı/Alıcı) ilk sayfalardan, genel toplamları (Matrah, KDV, Ödenecek Tutar) ise en son sayfadaki nihai toplam tablosundan al.

ÖNEMLİ DİKKAT EDİLECEK NOKTALAR:
- Sayısal alanları kesinlikle metin olarak değil 'number' (ondalıklı ise nokta ile örn: 1250.75) olarak döndür.
- Türk Lirası virgül/nokta ayrımına dikkat et (Örn: 1.250,50 TL -> 1250.50).
- Hiçbir ürün/hizmet satırını atlama veya özetleme; kaç satır ve sayfa varsa hepsini tek tek listele.
- Kategori alanını MUTLAKA kullanıcının Mizanında tanımlı şu kategorilerden seç: [${categoryListStr}]. Asla başka kategori uydurma.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        metadata: {
          type: Type.OBJECT,
          properties: {
            faturaNo: { type: Type.STRING, description: 'Fatura Numarası (örn: GIB2024000000123)' },
            faturaTarihi: { type: Type.STRING, description: 'Fatura Tarihi (YYYY-AA-GG veya GG.AA.YYYY)' },
            duzenlemeSaati: { type: Type.STRING, description: 'Düzenleme Saati (örn: 14:30)' },
            faturaTipi: { type: Type.STRING, description: 'Fatura Tipi (SATIŞ, İADE, TEVKİFAT vb.)' },
            ettn: { type: Type.STRING, description: 'ETTN UUID kodu' },
            saticiUnvan: { type: Type.STRING, description: 'Satıcı / Düzenleyen Firma Adı' },
            saticiVknTckn: { type: Type.STRING, description: 'Satıcı Vergi Kimlik No / TC Kimlik No' },
            saticiAdres: { type: Type.STRING, description: 'Satıcı Adresi ve İletişim' },
            saticiVergiDairesi: { type: Type.STRING, description: 'Satıcı Vergi Dairesi' },
            aliciUnvan: { type: Type.STRING, description: 'Alıcı / Müşteri Firma Adı' },
            aliciVknTckn: { type: Type.STRING, description: 'Alıcı Vergi / TC Kimlik No' },
            aliciAdres: { type: Type.STRING, description: 'Alıcı Adresi' },
            paraBirimi: { type: Type.STRING, description: 'Para Birimi (TRY, USD, EUR)' },
            odemeSekli: { type: Type.STRING, description: 'Ödeme Şekli veya Vade' },
            malHizmetToplamTutari: { type: Type.NUMBER, description: 'Toplam Matrah / Mal Hizmet Tutarı' },
            toplamIskonto: { type: Type.NUMBER, description: 'Toplam İskonto Tutarı' },
            toplamKdv: { type: Type.NUMBER, description: 'Toplam KDV Tutarı' },
            odenecekTutar: { type: Type.NUMBER, description: 'Genel Toplam / Ödenecek Tutar' },
            notlar: { type: Type.STRING, description: 'Fatura Notları veya Açıklama' },
          },
          required: [
            'faturaNo',
            'faturaTarihi',
            'saticiUnvan',
            'saticiVknTckn',
            'aliciUnvan',
            'paraBirimi',
            'malHizmetToplamTutari',
            'toplamKdv',
            'odenecekTutar',
          ],
        },
        items: {
          type: Type.ARRAY,
          description: 'Faturada listelenen tüm ürün, mal ve hizmet kalemleri',
          items: {
            type: Type.OBJECT,
            properties: {
              siraNo: { type: Type.INTEGER, description: 'Sıra No (1, 2, 3...)' },
              urunHizmetAdi: { type: Type.STRING, description: 'Mal/Ürün/Hizmet Adı' },
              urunKodu: { type: Type.STRING, description: 'Ürün Kodu/Barkod (varsa)' },
              aciklama: { type: Type.STRING, description: 'Detay/Açıklama (varsa)' },
              miktar: { type: Type.NUMBER, description: 'Miktar' },
              birim: { type: Type.STRING, description: 'Birim (Adet, Kg, Litre, Paket, Metre vb.)' },
              birimFiyat: { type: Type.NUMBER, description: 'Birim Fiyat (KDV Hariç)' },
              iskontoOrani: { type: Type.NUMBER, description: 'İskonto Oranı (%)' },
              iskontoTutari: { type: Type.NUMBER, description: 'İskonto Tutarı' },
              kdvOrani: { type: Type.NUMBER, description: 'KDV Oranı (%)' },
              kdvTutari: { type: Type.NUMBER, description: 'KDV Tutarı' },
              satirToplami: { type: Type.NUMBER, description: 'Mal Hizmet Tutarı / Satır Toplamı' },
              kategori: { type: Type.STRING, description: 'Kategori (Kırtasiye, Donanım, Sarf Malzeme, Hizmet, Elektronik, Temizlik, Gıda, Mobilya, Diğer)' },
              paraBirimi: { type: Type.STRING, description: 'Para Birimi (TRY, USD vb.)' },
            },
            required: [
              'siraNo',
              'urunHizmetAdi',
              'miktar',
              'birim',
              'birimFiyat',
              'kdvOrani',
              'kdvTutari',
              'satirToplami',
            ],
          },
        },
      },
      required: ['metadata', 'items'],
    };

    const { text, modelUsed } = await generateInvoiceContentWithFallback(
      base64Data,
      mimeType,
      fileName,
      systemPrompt,
      responseSchema
    );

    const parsedJson = JSON.parse(text || '{}');

    // Post-process & guarantee exact net unit price calculation based on discount and total/quantity
    if (parsedJson && Array.isArray(parsedJson.items)) {
      parsedJson.items = parsedJson.items.map((it: any, idx: number) => {
        const miktar = Number(it.miktar) > 0 ? Number(it.miktar) : 1;
        let birimFiyat = Number(it.birimFiyat) || 0;
        const iskontoOrani = Number(it.iskontoOrani) || 0;
        const iskontoTutari = Number(it.iskontoTutari) || 0;
        let satirToplami = Number(it.satirToplami) || 0;

        // 1. İskonto oranı varsa liste fiyatına uygula
        if (iskontoOrani > 0 && birimFiyat > 0) {
          birimFiyat = birimFiyat * (1 - iskontoOrani / 100);
        } else if (iskontoTutari > 0 && miktar > 0 && birimFiyat > 0) {
          // İskonto tutarı varsa satır birim fiyatından düş
          birimFiyat = birimFiyat - iskontoTutari / miktar;
        } else if (satirToplami > 0 && miktar > 0) {
          // İskonto oranı belirtilmemişse veya emin olunamıyorsa: Satır Tutarı / Miktar
          birimFiyat = satirToplami / miktar;
        }

        // 2. Doğrulama: Eğer satır toplamı varsa ve miktar * birimFiyat ile uyuşmuyorsa, net tutar / miktar esas alınır
        if (satirToplami > 0 && miktar > 0 && Math.abs(miktar * birimFiyat - satirToplami) > 0.01) {
          birimFiyat = satirToplami / miktar;
        }

        // Satır toplamı sıfırsa hesapla
        if (satirToplami === 0 && birimFiyat > 0) {
          satirToplami = Number((miktar * birimFiyat).toFixed(2));
        }

        // KDV tutarını doğrula
        const kdvOrani = Number(it.kdvOrani) ?? 20;
        let kdvTutari = Number(it.kdvTutari) || 0;
        if (kdvTutari === 0 && satirToplami > 0) {
          kdvTutari = Number(((satirToplami * kdvOrani) / 100).toFixed(2));
        }

        // Kategori doğrulaması: Mizan kategorileri arasından tam veya en yakın eşleşeni bul
        let assignedCategory = validCategories[0] || 'Genel Gider';
        if (it.kategori && typeof it.kategori === 'string') {
          const rawCat = it.kategori.trim().toLowerCase();
          const exactMatch = validCategories.find(
            (c) => c.toLowerCase() === rawCat
          );
          if (exactMatch) {
            assignedCategory = exactMatch;
          } else {
            const partialMatch = validCategories.find(
              (c) =>
                c.toLowerCase().includes(rawCat) ||
                rawCat.includes(c.toLowerCase())
            );
            if (partialMatch) {
              assignedCategory = partialMatch;
            }
          }
        }

        return {
          ...it,
          siraNo: it.siraNo || idx + 1,
          miktar,
          birimFiyat: Number(birimFiyat.toFixed(4)),
          iskontoOrani,
          iskontoTutari,
          kdvOrani,
          kdvTutari,
          satirToplami: Number(satirToplami.toFixed(2)),
          kategori: assignedCategory,
        };
      });
    }

    return res.json({ success: true, data: parsedJson, modelUsed });
  } catch (error: any) {
    console.error('Invoice parsing final error:', error);
    let errorMessage = error?.message || 'Fatura analiz edilirken bir hata meydana geldi.';

    if (errorMessage.includes('503') || errorMessage.includes('UNAVAILABLE') || errorMessage.includes('high demand')) {
      errorMessage = 'Yapay zeka modelleri geçici yoğunluk yaşıyor. Lütfen birkaç saniye sonra tekrar deneyin.';
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Fatura Ayıklayıcı Sunucusu ${PORT} portunda çalışıyor.`);
  });
}

startServer();
