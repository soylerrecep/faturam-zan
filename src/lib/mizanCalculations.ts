import { MizanStockItem, MizanMovement } from '../types';
import { toTurkishLower } from './turkishUtils';

/**
 * Ağırlıklı Ortalama Maliyet (Weighted Average Cost - WAC) Hesaplayıcı
 * 
 * Muhasebe ve Mizan standardı:
 * Yeni birim maliyet = (Mevcut Kalan Miktar * Mevcut Ortalama Fiyat + Yeni Giren Miktar * Yeni Alış Fiyatı) / (Mevcut Kalan Miktar + Yeni Giren Miktar)
 */
export function calculateWeightedAverageCost(
  prevRemainingQty: number,
  prevAvgPrice: number,
  newQty: number,
  newPrice: number
): number {
  const positiveRemaining = Math.max(0, Number(prevRemainingQty) || 0);
  const prevPrice = Math.max(0, Number(prevAvgPrice) || 0);
  const incomingQty = Math.max(0, Number(newQty) || 0);
  const incomingPrice = Math.max(0, Number(newPrice) || 0);

  const prevValue = positiveRemaining * prevPrice;
  const incomingValue = incomingQty * incomingPrice;
  const totalAvailableQty = positiveRemaining + incomingQty;

  if (totalAvailableQty <= 0) {
    return incomingPrice > 0 ? incomingPrice : prevPrice;
  }

  if (incomingPrice <= 0 && prevPrice > 0) {
    return prevPrice;
  }

  if (incomingQty > 0 && positiveRemaining <= 0) {
    return incomingPrice;
  }

  const weightedAverage = (prevValue + incomingValue) / totalAvailableQty;
  // Hassas 4 ondalıklı birim maliyet
  return Number(weightedAverage.toFixed(4));
}

/**
 * Bir Mizan kaleminin Net Değer (Matrah), KDV Tutarı ve Brüt (KDV Dahil) değerlerini kuruş hassasiyetinde hesaplar.
 */
export function calculateMizanItemValues(
  kalanMiktar: number,
  ortalamaBirimFiyat: number,
  kdvOrani: number = 20
): {
  toplamDeger: number;
  toplamKdvTutari: number;
  toplamKdvDahilDeger: number;
} {
  const qty = Number(kalanMiktar) || 0;
  const unitPrice = Number(ortalamaBirimFiyat) || 0;
  const rate = Number(kdvOrani) || 0;

  // KDV Hariç Tutar (Matrah)
  const matrah = Number((qty * unitPrice).toFixed(2));
  // KDV Tutarı
  const kdvTutari = Number(((matrah * rate) / 100).toFixed(2));
  // KDV Dahil Brüt Tutar
  const kdvDahil = Number((matrah + kdvTutari).toFixed(2));

  return {
    toplamDeger: matrah,
    toplamKdvTutari: kdvTutari,
    toplamKdvDahilDeger: kdvDahil,
  };
}

/**
 * Stok kalemini doğrular ve olası bozuk sayısal değerleri düzeltir (Self-healing).
 */
export function sanitizeStockItem(item: MizanStockItem): MizanStockItem {
  const toplamGiris = Number(item.toplamGiris) || 0;
  const toplamCikis = Number(item.toplamCikis) || 0;
  const kalanMiktar = toplamGiris - toplamCikis;
  const ortalamaBirimFiyat = Number(item.ortalamaBirimFiyat) || 0;
  const kdvOrani = item.kdvOrani !== undefined ? Number(item.kdvOrani) : 20;

  const { toplamDeger, toplamKdvTutari, toplamKdvDahilDeger } = calculateMizanItemValues(
    kalanMiktar,
    ortalamaBirimFiyat,
    kdvOrani
  );

  return {
    ...item,
    toplamGiris,
    toplamCikis,
    kalanMiktar,
    ortalamaBirimFiyat,
    kdvOrani,
    toplamDeger,
    toplamKdvTutari,
    toplamKdvDahilDeger,
  };
}

/**
 * Hareket loglarından tüm şirket ve mali yıl stok bakiyelerini sıfırdan kuruşu kuruşuna denetler ve yeniden hesaplar.
 */
export function auditAndRecalculateStockFromMovements(
  stockItems: MizanStockItem[],
  movements: MizanMovement[],
  activeCompany: string,
  activeYear: number
): {
  recalculatedStock: MizanStockItem[];
  totalMatrah: number;
  totalKdv: number;
  totalBrut: number;
  itemCount: number;
} {
  const getStockKey = (uAdi: string, brm: string) =>
    `${toTurkishLower(uAdi || '').trim()}_${toTurkishLower(brm || 'Adet').trim()}`;

  // Sadece aktif şirket ve yılın hareketlerini filtrele (tarihe göre sıralı)
  const activeMovements = movements
    .filter((m) => {
      const c = m.companyName || 'Varsayılan Şirket';
      const y = m.year || 2026;
      return c === activeCompany && y === activeYear;
    })
    .sort((a, b) => (a.tarih || '').localeCompare(b.tarih || ''));

  // Mevcut diğer şirketlerin stoklarını koru
  const otherStock = stockItems.filter((st) => {
    const c = st.companyName || 'Varsayılan Şirket';
    const y = st.year || 2026;
    return !(c === activeCompany && y === activeYear);
  });

  const activeStock = stockItems.filter((st) => {
    const c = st.companyName || 'Varsayılan Şirket';
    const y = st.year || 2026;
    return c === activeCompany && y === activeYear;
  });

  const stockMap = new Map<string, MizanStockItem>();

  // Önce mevcut aktif stok şablonlarını al
  activeStock.forEach((st) => {
    const sanitized = sanitizeStockItem(st);
    stockMap.set(getStockKey(st.urunAdi, st.birim), sanitized);
  });

  // Eğer hareketler mevcutsa, hareketlerden kesin hesaplama yap
  if (activeMovements.length > 0) {
    // Sıfırla ve hareketlerden baştan inşa et
    const reconstructedMap = new Map<string, MizanStockItem>();

    activeMovements.forEach((mov) => {
      const key = getStockKey(mov.urunAdi, mov.birim);
      const miktar = Number(mov.miktar) || 0;
      const birimFiyat = Number(mov.birimFiyat) || 0;
      const kdv = mov.kdvOrani !== undefined ? Number(mov.kdvOrani) : 20;

      if (!reconstructedMap.has(key)) {
        // İlk hareket
        const isGiris = mov.islemTipi === 'giris';
        const girisMiktar = isGiris ? miktar : 0;
        const cikisMiktar = isGiris ? 0 : miktar;
        const kalan = girisMiktar - cikisMiktar;
        const values = calculateMizanItemValues(kalan, birimFiyat, kdv);

        reconstructedMap.set(key, {
          id: `stock-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          companyName: activeCompany,
          year: activeYear,
          urunAdi: mov.urunAdi,
          kategori: mov.kategori || 'Genel Gider',
          birim: mov.birim || 'Adet',
          toplamGiris: girisMiktar,
          toplamCikis: cikisMiktar,
          kalanMiktar: kalan,
          ortalamaBirimFiyat: birimFiyat,
          kdvOrani: kdv,
          toplamDeger: values.toplamDeger,
          toplamKdvTutari: values.toplamKdvTutari,
          toplamKdvDahilDeger: values.toplamKdvDahilDeger,
          sonIslemTarihi: mov.tarih || new Date().toISOString().slice(0, 10),
          hareketSayisi: 1,
        });
      } else {
        const item = reconstructedMap.get(key)!;
        if (mov.islemTipi === 'giris') {
          const newAvg = calculateWeightedAverageCost(
            item.kalanMiktar,
            item.ortalamaBirimFiyat,
            miktar,
            birimFiyat
          );
          item.toplamGiris += miktar;
          item.ortalamaBirimFiyat = newAvg;
        } else {
          item.toplamCikis += miktar;
          if (birimFiyat > 0 && item.ortalamaBirimFiyat === 0) {
            item.ortalamaBirimFiyat = birimFiyat;
          }
        }
        item.kalanMiktar = item.toplamGiris - item.toplamCikis;
        item.kdvOrani = kdv;
        if (mov.kategori && (!item.kategori || item.kategori === 'Genel Gider' || item.kategori === 'Diğer')) {
          item.kategori = mov.kategori;
        }
        const values = calculateMizanItemValues(item.kalanMiktar, item.ortalamaBirimFiyat, kdv);
        item.toplamDeger = values.toplamDeger;
        item.toplamKdvTutari = values.toplamKdvTutari;
        item.toplamKdvDahilDeger = values.toplamKdvDahilDeger;
        item.sonIslemTarihi = mov.tarih || item.sonIslemTarihi;
        item.hareketSayisi += 1;
      }
    });

    const activeList = Array.from(reconstructedMap.values());
    const totalMatrah = Number(activeList.reduce((s, i) => s + i.toplamDeger, 0).toFixed(2));
    const totalKdv = Number(activeList.reduce((s, i) => s + (i.toplamKdvTutari || 0), 0).toFixed(2));
    const totalBrut = Number((totalMatrah + totalKdv).toFixed(2));

    return {
      recalculatedStock: [...otherStock, ...activeList],
      totalMatrah,
      totalKdv,
      totalBrut,
      itemCount: activeList.length,
    };
  } else {
    // Hareket yoksa sadece mevcut stokları sanitize et
    const activeList = Array.from(stockMap.values()).map(sanitizeStockItem);
    const totalMatrah = Number(activeList.reduce((s, i) => s + i.toplamDeger, 0).toFixed(2));
    const totalKdv = Number(activeList.reduce((s, i) => s + (i.toplamKdvTutari || 0), 0).toFixed(2));
    const totalBrut = Number((totalMatrah + totalKdv).toFixed(2));

    return {
      recalculatedStock: [...otherStock, ...activeList],
      totalMatrah,
      totalKdv,
      totalBrut,
      itemCount: activeList.length,
    };
  }
}
