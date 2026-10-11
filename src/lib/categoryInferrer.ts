import { MizanStockItem } from '../types';
import { toTurkishLower, turkishEqual } from './turkishUtils';

/**
 * Finds a matching stock item in Mizan by product name.
 * Uses exact match, normalized match, and substring match.
 */
export function findMizanStockMatch(
  productName: string,
  existingStockItems: MizanStockItem[] = []
): MizanStockItem | undefined {
  if (!productName || !productName.trim() || !existingStockItems || existingStockItems.length === 0) {
    return undefined;
  }

  const pLower = toTurkishLower(productName).trim();
  const pNorm = pLower.replace(/[^a-z0-9ğüşıöç]/g, '');

  // 1. Exact match
  let match = existingStockItems.find((st) => st.urunAdi && turkishEqual(st.urunAdi, productName));
  if (match) return match;

  // 2. Normalized match (ignoring dots, spaces, parens, punctuation)
  if (pNorm.length >= 3) {
    match = existingStockItems.find((st) => {
      if (!st.urunAdi) return false;
      const sNorm = toTurkishLower(st.urunAdi).replace(/[^a-z0-9ğüşıöç]/g, '');
      return sNorm === pNorm;
    });
    if (match) return match;
  }

  // 3. Substring match for substantial product names
  return existingStockItems.find((st) => {
    if (!st.urunAdi) return false;
    const sLower = toTurkishLower(st.urunAdi).trim();
    return (
      (sLower.length >= 3 && pLower.includes(sLower)) ||
      (pLower.length >= 3 && sLower.includes(pLower))
    );
  });
}

/**
 * Automatically infers the category for a product based on its name,
 * matching against existing stock items in Mizan first, then category keywords, and concept maps.
 */
export function inferCategoryForProduct(
  productName: string,
  availableCategories: string[] = [],
  existingStockItems: MizanStockItem[] = []
): string {
  if (!productName || !productName.trim()) {
    return availableCategories[0] || 'Genel Gider';
  }

  // 1. Check if the product already exists in Mizan stock items
  const stockMatch = findMizanStockMatch(productName, existingStockItems);
  if (stockMatch && stockMatch.kategori) {
    return stockMatch.kategori;
  }

  const pLower = toTurkishLower(productName).trim();

  // 2. Direct keyword check against available category names
  for (const cat of availableCategories) {
    const catLower = toTurkishLower(cat);
    const tokens = catLower.split(/[\s&/,.-]+/).filter((t) => t.length >= 3);
    for (const token of tokens) {
      if (pLower.includes(token)) {
        return cat;
      }
    }
  }

  // 3. Keyword dictionary mapped to concept categories
  const keywordMap: Record<string, string[]> = {
    gida: [
      'çay', 'kahve', 'su', 'meşrubat', 'kola', 'soda', 'ayran', 'süt', 'meyve', 'sebze',
      'ekmek', 'gıda', 'yemek', 'mutfak', 'et', 'tavuk', 'balık', 'yağ', 'şeker', 'un',
      'tatlı', 'bisküvi', 'çikolata', 'dondurma', 'peynir', 'yoğurt', 'pide', 'döner', 'lahmacun'
    ],
    kirtasiye: [
      'kağıt', 'kalem', 'defter', 'dosya', 'klasör', 'toner', 'kartuş', 'zımba', 'kırtasiye',
      'büro', 'evrak', 'zarf', 'mürekkep', 'silgi', 'cetvel', 'bant', 'koli bandı', 'etiket', 'A4'
    ],
    temizlik: [
      'temizlik', 'sabun', 'deterjan', 'peçete', 'havlu', 'dezenfektan', 'çamaşır', 'bulaşık',
      'hijyen', 'mop', 'sünger', 'kolonya', 'paspas', 'çöp poşeti', 'çamaşır suyu', 'jel'
    ],
    elektronik: [
      'bilgisayar', 'laptop', 'monitör', 'klavye', 'fare', 'mouse', 'kablo', 'adaptör',
      'telefon', 'elektronik', 'yazıcı', 'printer', 'disk', 'ssd', 'ram', 'bellek',
      'ekran', 'şarj', 'kulaklık', 'televizyon', 'tv', 'usb', 'modem', 'switch'
    ],
    lojistik: [
      'kargo', 'nakliye', 'taşıma', 'kurye', 'lojistik', 'sevkiyat', 'nakliyat', 'kamyon', 'nakil'
    ],
    mobilya: [
      'masa', 'sandalye', 'koltuk', 'dolap', 'raf', 'mobilya', 'sehpa', 'büro masası', 'kitaplık'
    ],
    bakim: [
      'bakım', 'onarım', 'tamir', 'yedek parça', 'servis', 'işçilik', 'revizyon', 'filtre', 'yağ değişimi'
    ],
    hizmet: [
      'yazılım', 'lisans', 'danışmanlık', 'eğitim', 'tasarım', 'hizmet', 'proje', 'organizasyon',
      'reklam', 'medya', 'web', 'sunucu', 'domain', 'hosting'
    ],
    hammadde: [
      'hammadde', 'sac', 'profil', 'boru', 'metal', 'plastik', 'kumaş', 'iplik', 'üretim',
      'boya', 'reçine', 'kereste', 'çimento', 'demir', 'alüminyum', 'çelik'
    ],
  };

  for (const [conceptKey, keywords] of Object.entries(keywordMap)) {
    if (keywords.some((kw) => pLower.includes(kw))) {
      const match = availableCategories.find((cat) => {
        const cLower = toTurkishLower(cat);
        if (conceptKey === 'gida') return cLower.includes('gıda') || cLower.includes('mutfak') || cLower.includes('yiyecek');
        if (conceptKey === 'kirtasiye') return cLower.includes('kırtasiye') || cLower.includes('büro') || cLower.includes('ofis');
        if (conceptKey === 'temizlik') return cLower.includes('temizlik') || cLower.includes('hijyen');
        if (conceptKey === 'elektronik') return cLower.includes('elektronik') || cLower.includes('bilişim') || cLower.includes('teknoloji');
        if (conceptKey === 'lojistik') return cLower.includes('lojistik') || cLower.includes('kargo') || cLower.includes('nakliye');
        if (conceptKey === 'mobilya') return cLower.includes('mobilya') || cLower.includes('ofis');
        if (conceptKey === 'bakim') return cLower.includes('bakım') || cLower.includes('onarım');
        if (conceptKey === 'hizmet') return cLower.includes('hizmet') || cLower.includes('danışmanlık');
        if (conceptKey === 'hammadde') return cLower.includes('hammadde') || cLower.includes('üretim');
        return false;
      });
      if (match) return match;
    }
  }

  // 4. Default fallbacks
  if (availableCategories.includes('Genel Gider')) return 'Genel Gider';
  if (availableCategories.includes('Diğer')) return 'Diğer';
  return availableCategories[0] || 'Genel Gider';
}

