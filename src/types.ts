export type AppMainSection = 'fatura-tara' | 'mizan';

export interface InvoiceItem {
  id: string;
  siraNo: number;
  urunHizmetAdi: string;
  urunKodu?: string;
  aciklama?: string;
  miktar: number;
  birim: string; // Adet, Kg, Litre, Metre, Paket, Koli, Gün, Saat, Ay, vb.
  birimFiyat: number; // KDV Hariç Birim Fiyat
  iskontoOrani?: number; // %
  iskontoTutari?: number; // TL
  kdvOrani: number; // % (0, 1, 10, 20 vb.)
  kdvTutari: number; // TL
  satirToplami: number; // KDV Hariç veya Dahil Satır Tutarı
  kategori?: string; // Sütun F için Kategori (örn: Kırtasiye, Donanım, Sarf Malzeme, Hizmet, Elektronik, Temizlik, Gıda, Mobilya vb.)
  paraBirimi?: string; // TRY, USD, EUR vb.
  isTransferred?: boolean; // Sağdaki Excel tablosuna aktarıldı mı?
}

export interface InvoiceMetadata {
  faturaNo: string;
  faturaTarihi: string;
  duzenlemeSaati?: string;
  faturaTipi?: string; // SATIŞ, İADE, İSTİSNA, TEVKİFAT vb.
  ettn?: string; // e-Fatura ETTN UUID
  saticiUnvan: string;
  saticiVknTckn: string;
  saticiAdres?: string;
  saticiVergiDairesi?: string;
  aliciUnvan: string;
  aliciVknTckn?: string;
  aliciAdres?: string;
  paraBirimi: string;
  odemeSekli?: string;
  malHizmetToplamTutari: number; // Matrah
  toplamIskonto?: number;
  toplamKdv: number;
  odenecekTutar: number; // Genel Toplam
  notlar?: string;
}

export interface ProcessedInvoice {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileDataUrl?: string;
  uploadDate: string;
  status: 'idle' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  metadata: InvoiceMetadata;
  items: InvoiceItem[];
}

/**
 * Sağ tarafta Excel tablosunda (A-F Sütunları) yer alacak nihai satır yapısı
 */
export interface MasterExcelRow {
  id: string;
  urunAdi: string; // Sütun A: Ürün Adı
  miktar: number; // Sütun B: Miktar
  birim: string; // Sütun C: Birim
  fiyat: number; // Sütun D: Fiyat (Birim Fiyat)
  kdvOrani: number; // Sütun E: KDV Oranı (%)
  kategori: string; // Sütun F: Kategori
  sourceInvoiceId?: string;
  sourceInvoiceNo?: string;
}

/**
 * Mizan Stok Kalemi
 */
export interface MizanStockItem {
  id: string;
  companyName?: string;
  year?: number;
  urunAdi: string;
  kategori: string;
  birim: string;
  toplamGiris: number; // Mizana Stok Ekle ile giren toplam
  toplamCikis: number; // Mizana Stok Düşür ile çıkan toplam
  kalanMiktar: number; // Net Stok Bakiyesi (Giriş - Çıkış)
  ortalamaBirimFiyat: number; // KDV Hariç Birim Fiyat
  kdvOrani?: number; // KDV Oranı (%) örn: 20, 10, 1, 0
  toplamDeger: number; // kalanMiktar * ortalamaBirimFiyat (Matrah)
  toplamKdvTutari?: number; // Matrah * KDV Oranı
  toplamKdvDahilDeger?: number; // Matrah + KDV Tutarı
  sonIslemTarihi: string;
  hareketSayisi: number;
}

/**
 * Mizan Stok Hareketi
 */
export interface MizanMovement {
  id: string;
  companyName?: string;
  year?: number;
  tarih: string;
  islemTipi: 'giris' | 'cikis'; // 'giris' (Stok Ekle) | 'cikis' (Stok Düşür)
  urunAdi: string;
  kategori: string;
  miktar: number;
  birim: string;
  birimFiyat: number;
  kdvOrani?: number; // KDV Oranı (%) örn: 20, 10, 1, 0
  kdvTutari?: number; // KDV Tutarı (TL)
  toplamTutar: number;
  faturaNo?: string;
}

export const INITIAL_MIZAN_CATEGORIES: string[] = [
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

export const COMMON_CATEGORIES = INITIAL_MIZAN_CATEGORIES;
