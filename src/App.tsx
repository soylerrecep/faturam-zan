import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet,
  FileText,
  UploadCloud,
  Plus,
  Trash2,
  Download,
  Copy,
  Layers,
  Sparkles,
  Receipt,
  Info,
  CheckCircle2,
  Database,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  ProcessedInvoice,
  InvoiceItem,
  InvoiceMetadata,
  MasterExcelRow,
  AppMainSection,
  MizanStockItem,
  MizanMovement,
  INITIAL_MIZAN_CATEGORIES,
} from './types';
import { Header } from './components/Header';
import { FileUploadArea } from './components/FileUploadArea';
import { InvoiceQueuePanel } from './components/InvoiceQueuePanel';
import { InvoiceMiddleEditor } from './components/InvoiceMiddleEditor';
import { MasterExcelTable } from './components/MasterExcelTable';
import { MizanView } from './components/MizanView';
import { InvoiceDocumentViewer } from './components/InvoiceDocumentViewer';
import { DuplicateInvoiceModal, DuplicateMatch } from './components/DuplicateInvoiceModal';
import { saveInvoiceDocument } from './lib/documentStorage';
import { SAMPLE_INVOICES } from './lib/sampleInvoices';
import {
  exportMasterExcelFile,
  copyMasterExcelRowsToClipboard,
} from './lib/excelExport';
import {
  calculateWeightedAverageCost,
  calculateMizanItemValues,
  sanitizeStockItem,
  auditAndRecalculateStockFromMovements,
} from './lib/mizanCalculations';
import { inferCategoryForProduct, findMizanStockMatch } from './lib/categoryInferrer';
import {
  toTurkishLower,
  turkishEqual,
  deepSanitizeTurkish,
  fixTurkishMojibake,
} from './lib/turkishUtils';

export interface BackupPayload {
  version: number;
  timestamp: string;
  exportDateStr: string;
  invoices: ProcessedInvoice[];
  masterExcelRows: MasterExcelRow[];
  mizanStockItems: MizanStockItem[];
  mizanMovements: MizanMovement[];
  mizanCategories: string[];
  companies: string[];
  activeCompany: string;
  years: number[];
  activeYear: number;
}

const STORAGE_INVOICES_KEY = 'FATURA_OCR_SAVED_INVOICES_V2';
const STORAGE_EXCEL_KEY = 'FATURA_OCR_MASTER_EXCEL_ROWS_V2';
const STORAGE_MIZAN_STOCK_KEY = 'FATURA_OCR_MIZAN_STOCK_V2';
const STORAGE_MIZAN_MOVEMENTS_KEY = 'FATURA_OCR_MIZAN_MOVEMENTS_V2';
const STORAGE_MIZAN_CATEGORIES_KEY = 'FATURA_OCR_MIZAN_CATEGORIES_V2';
const STORAGE_COMPANIES_KEY = 'FATURA_OCR_COMPANIES_V1';
const STORAGE_ACTIVE_COMPANY_KEY = 'FATURA_OCR_ACTIVE_COMPANY_V1';
const STORAGE_YEARS_KEY = 'FATURA_OCR_YEARS_V1';
const STORAGE_ACTIVE_YEAR_KEY = 'FATURA_OCR_ACTIVE_YEAR_V1';

const DEFAULT_COMPANIES = ['Varsayılan Şirket'];
const DEFAULT_YEARS = [2024, 2025, 2026, 2027];

// Helper to generate sample Mizan items from sample invoices
function generateSampleMizan(): { items: MizanStockItem[]; movements: MizanMovement[] } {
  const stockMap = new Map<string, MizanStockItem>();
  const movements: MizanMovement[] = [];
  const today = new Date().toISOString().slice(0, 10);

  SAMPLE_INVOICES.forEach((inv) => {
    inv.items.forEach((item) => {
      const key = toTurkishLower(item.urunHizmetAdi || '').trim();
      const miktar = Number(item.miktar) || 1;
      const fiyat = Number(item.birimFiyat) || 0;
      const kdv = Number(item.kdvOrani) || 20;
      const tutar = miktar * fiyat;
      const kdvTutari = (tutar * kdv) / 100;

      // Add movement
      movements.push({
        id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        tarih: inv.metadata.faturaTarihi || today,
        islemTipi: 'giris',
        urunAdi: item.urunHizmetAdi,
        kategori: item.kategori || 'Genel Gider',
        miktar: miktar,
        birim: item.birim || 'Adet',
        birimFiyat: fiyat,
        kdvOrani: kdv,
        kdvTutari: kdvTutari,
        toplamTutar: tutar,
        faturaNo: inv.metadata.faturaNo,
      });

      if (!stockMap.has(key)) {
        stockMap.set(key, {
          id: `stock-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          urunAdi: item.urunHizmetAdi,
          kategori: item.kategori || 'Genel Gider',
          birim: item.birim || 'Adet',
          toplamGiris: miktar,
          toplamCikis: 0,
          kalanMiktar: miktar,
          ortalamaBirimFiyat: fiyat,
          kdvOrani: kdv,
          toplamDeger: tutar,
          toplamKdvTutari: kdvTutari,
          toplamKdvDahilDeger: tutar + kdvTutari,
          sonIslemTarihi: inv.metadata.faturaTarihi || today,
          hareketSayisi: 1,
        });
      } else {
        const existing = stockMap.get(key)!;
        const prevQty = existing.kalanMiktar;
        const prevPrice = existing.ortalamaBirimFiyat;
        const newAvg = calculateWeightedAverageCost(prevQty, prevPrice, miktar, fiyat);
        existing.toplamGiris += miktar;
        existing.kalanMiktar = existing.toplamGiris - existing.toplamCikis;
        existing.ortalamaBirimFiyat = newAvg;
        existing.kdvOrani = kdv;
        const values = calculateMizanItemValues(existing.kalanMiktar, newAvg, kdv);
        existing.toplamDeger = values.toplamDeger;
        existing.toplamKdvTutari = values.toplamKdvTutari;
        existing.toplamKdvDahilDeger = values.toplamKdvDahilDeger;
        existing.hareketSayisi += 1;
      }
    });
  });

  return {
    items: Array.from(stockMap.values()),
    movements,
  };
}

export default function App() {
  // Navigation: 'fatura-tara' | 'mizan'
  const [currentSection, setCurrentSection] = useState<AppMainSection>('fatura-tara');

  // 1. Uploaded & parsed invoices state
  const [invoices, setInvoices] = useState<ProcessedInvoice[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_INVOICES_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load saved invoices:', e);
    }
    return [];
  });

  // 2. Right-side Master Excel Table rows (Columns A, B, C, D, E, F)
  const [masterExcelRows, setMasterExcelRows] = useState<MasterExcelRow[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_EXCEL_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load master excel rows:', e);
    }
    return [];
  });

  // 3. Mizan Stock Items & Movements
  const [mizanStockItems, setMizanStockItems] = useState<MizanStockItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_MIZAN_STOCK_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map(sanitizeStockItem);
        }
      }
    } catch (e) {
      console.error('Failed to load mizan stock:', e);
    }
    return [];
  });

  const [mizanMovements, setMizanMovements] = useState<MizanMovement[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_MIZAN_MOVEMENTS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load mizan movements:', e);
    }
    return [];
  });

  // 4. Mizan Categories State (Persisted)
  const [mizanCategories, setMizanCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_MIZAN_CATEGORIES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load mizan categories:', e);
    }
    return INITIAL_MIZAN_CATEGORIES;
  });

  // 5. Companies & Active Company
  const [companies, setCompanies] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_COMPANIES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to load companies:', e);
    }
    return DEFAULT_COMPANIES;
  });

  const [activeCompany, setActiveCompany] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ACTIVE_COMPANY_KEY);
      if (saved && saved.trim()) return saved;
    } catch (e) {
      console.error('Failed to load active company:', e);
    }
    return DEFAULT_COMPANIES[0];
  });

  // 6. Years & Active Year
  const [years, setYears] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_YEARS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to load years:', e);
    }
    return DEFAULT_YEARS;
  });

  const [activeYear, setActiveYear] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ACTIVE_YEAR_KEY);
      if (saved) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && parsed > 2000) return parsed;
      }
    } catch (e) {
      console.error('Failed to load active year:', e);
    }
    return 2026;
  });

  const [activeInvoiceId, setActiveInvoiceId] = useState<string>('');

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isSplitView, setIsSplitView] = useState(false);
  const [pendingDuplicates, setPendingDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [pendingNonDuplicates, setPendingNonDuplicates] = useState<ProcessedInvoice[]>([]);

  // Sync to localStorage with debounced background writing to prevent main-thread lag with large datasets
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_INVOICES_KEY, JSON.stringify(invoices));
      } catch (e) {
        console.error('Failed to persist invoices:', e);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [invoices]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_EXCEL_KEY, JSON.stringify(masterExcelRows));
      } catch (e) {
        console.error('Failed to persist master excel rows:', e);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [masterExcelRows]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_MIZAN_STOCK_KEY, JSON.stringify(mizanStockItems));
      } catch (e) {
        console.error('Failed to persist mizan stock:', e);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [mizanStockItems]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_MIZAN_MOVEMENTS_KEY, JSON.stringify(mizanMovements));
      } catch (e) {
        console.error('Failed to persist mizan movements:', e);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [mizanMovements]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_MIZAN_CATEGORIES_KEY, JSON.stringify(mizanCategories));
      } catch (e) {
        console.error('Failed to persist mizan categories:', e);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [mizanCategories]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_COMPANIES_KEY, JSON.stringify(companies));
    } catch (e) {
      console.error('Failed to persist companies:', e);
    }
  }, [companies]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACTIVE_COMPANY_KEY, activeCompany);
    } catch (e) {
      console.error('Failed to persist active company:', e);
    }
  }, [activeCompany]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_YEARS_KEY, JSON.stringify(years));
    } catch (e) {
      console.error('Failed to persist years:', e);
    }
  }, [years]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACTIVE_YEAR_KEY, String(activeYear));
    } catch (e) {
      console.error('Failed to persist active year:', e);
    }
  }, [activeYear]);

  // Immediate save on page unload to guarantee zero data loss
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        localStorage.setItem(STORAGE_INVOICES_KEY, JSON.stringify(invoices));
        localStorage.setItem(STORAGE_EXCEL_KEY, JSON.stringify(masterExcelRows));
        localStorage.setItem(STORAGE_MIZAN_STOCK_KEY, JSON.stringify(mizanStockItems));
        localStorage.setItem(STORAGE_MIZAN_MOVEMENTS_KEY, JSON.stringify(mizanMovements));
        localStorage.setItem(STORAGE_MIZAN_CATEGORIES_KEY, JSON.stringify(mizanCategories));
      } catch (e) {
        console.error('Unload save error:', e);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [invoices, masterExcelRows, mizanStockItems, mizanMovements, mizanCategories]);

  // Company and Year Management Helpers
  const handleAddCompany = (companyName: string) => {
    const trimmed = companyName.trim();
    if (!trimmed) return;
    if (companies.some((c) => turkishEqual(c, trimmed))) {
      showToast(`"${trimmed}" şirketi zaten mevcut.`);
      return;
    }
    setCompanies((prev) => [...prev, trimmed]);
    setActiveCompany(trimmed);
    showToast(`🏢 "${trimmed}" şirketi eklendi ve aktif şirket olarak seçildi.`);
  };

  const handleDeleteCompany = (companyName: string) => {
    if (companies.length <= 1) {
      showToast('En az bir şirket tanımlı olmalıdır.');
      return;
    }
    const filtered = companies.filter((c) => c !== companyName);
    setCompanies(filtered);
    if (activeCompany === companyName) {
      setActiveCompany(filtered[0]);
    }
    showToast(`"${companyName}" şirketi silindi.`);
  };

  const handleRenameCompany = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    if (companies.some((c) => c !== oldName && turkishEqual(c, trimmed))) {
      showToast(`"${trimmed}" adıyla başka bir şirket zaten mevcut.`);
      return;
    }

    setCompanies((prev) => prev.map((c) => (c === oldName ? trimmed : c)));

    if (activeCompany === oldName) {
      setActiveCompany(trimmed);
    }

    // Move all stock items & movements of oldName to trimmed
    setMizanStockItems((prev) =>
      prev.map((item) => {
        const itemCompany = item.companyName || DEFAULT_COMPANIES[0];
        if (itemCompany === oldName) {
          return { ...item, companyName: trimmed };
        }
        return item;
      })
    );

    setMizanMovements((prev) =>
      prev.map((mov) => {
        const movCompany = mov.companyName || DEFAULT_COMPANIES[0];
        if (movCompany === oldName) {
          return { ...mov, companyName: trimmed };
        }
        return mov;
      })
    );

    showToast(`🏢 "${oldName}" şirket ismi "${trimmed}" olarak değiştirildi.`);
  };

  const handleAddYear = (newYear: number) => {
    if (isNaN(newYear) || newYear < 2000 || newYear > 2100) {
      showToast('Geçersiz mali yıl.');
      return;
    }
    if (!years.includes(newYear)) {
      setYears((prev) => [...prev, newYear].sort((a, b) => a - b));
    }
    setActiveYear(newYear);
    showToast(`📅 ${newYear} yılı eklendi ve Mizan ${newYear} yılı için açıldı.`);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  const handleAddMizanCategory = (categoryName: string) => {
    const trimmed = categoryName.trim();
    if (!trimmed) return;
    if (mizanCategories.some((c) => turkishEqual(c, trimmed))) {
      showToast(`"${trimmed}" kategorisi zaten mevcut.`);
      return;
    }
    setMizanCategories((prev) => [...prev, trimmed]);
    showToast(`"${trimmed}" kategorisi Mizana eklendi ve tüm fatura işlemlerine tanımlandı.`);
  };

  const handleDeleteMizanCategory = (categoryName: string) => {
    if (mizanCategories.length <= 1) {
      showToast('En az bir kategori tanımlı kalmalıdır.');
      return;
    }

    // Kategori içerisinde stok ürünü mevcutsa silmeye izin verme
    const productsInStock = mizanStockItems.filter((item) =>
      turkishEqual(item.kategori, categoryName)
    );

    if (productsInStock.length > 0) {
      showToast(
        `❌ "${categoryName}" kategorisi silinemez! Bu kategoride ${productsInStock.length} adet kayıtlı stok ürünü bulunmaktadır.`
      );
      return;
    }

    // Fatura kuyruğundaki işlenmemiş kalemlerde bu kategori kullanılıyorsa kontrol et
    const itemsInQueue = invoices.flatMap((inv) =>
      inv.items.filter((it) => turkishEqual(it.kategori, categoryName))
    );
    if (itemsInQueue.length > 0) {
      showToast(
        `❌ "${categoryName}" kategorisi silinemez! Bekleyen faturalarda bu kategoriye ait ${itemsInQueue.length} adet satır bulunmaktadır.`
      );
      return;
    }

    setMizanCategories((prev) => prev.filter((c) => !turkishEqual(c, categoryName)));
    showToast(`🗑️ "${categoryName}" kategorisi başarıyla silindi.`);
  };

  const handleEditMizanCategory = (oldCategoryName: string, newCategoryName: string) => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (trimmed === oldCategoryName) return;
    if (mizanCategories.some((c) => c !== oldCategoryName && turkishEqual(c, trimmed))) {
      showToast(`"${trimmed}" adında başka bir kategori zaten mevcut.`);
      return;
    }

    // 1. Update category in category list
    setMizanCategories((prev) =>
      prev.map((c) => (c === oldCategoryName ? trimmed : c))
    );

    // 2. Update stock items
    setMizanStockItems((prev) =>
      prev.map((item) => {
        if (item.kategori === oldCategoryName) {
          return { ...item, kategori: trimmed };
        }
        return item;
      })
    );

    // 3. Update stock movements
    setMizanMovements((prev) =>
      prev.map((mov) => {
        if (mov.kategori === oldCategoryName) {
          return { ...mov, kategori: trimmed };
        }
        return mov;
      })
    );

    // 4. Update in-queue invoice items
    setInvoices((prev) =>
      prev.map((inv) => ({
        ...inv,
        items: inv.items.map((it) =>
          it.kategori === oldCategoryName ? { ...it, kategori: trimmed } : it
        ),
      }))
    );

    // 5. Update Master Excel rows
    setMasterExcelRows((prev) =>
      prev.map((r) =>
        r.kategori === oldCategoryName ? { ...r, kategori: trimmed } : r
      )
    );

    showToast(`🏷️ "${oldCategoryName}" kategorisi "${trimmed}" olarak güncellendi ve tüm kayıtlara uygulandı.`);
  };

  // Helper to commit final validated invoices to state and update categories/KDV
  const applyProcessedInvoices = (
    invoicesToAdd: ProcessedInvoice[],
    invoicesToReplace: { oldId: string; newInvoice: ProcessedInvoice }[] = []
  ) => {
    // 1. Process items with categories
    const processedInvoicesToAdd = invoicesToAdd.map((inv) => ({
      ...inv,
      items: inv.items.map((item) => {
        const pName = item.urunHizmetAdi || '';
        const categoryFromMizanOrAuto = inferCategoryForProduct(
          pName,
          mizanCategories,
          mizanStockItems
        );
        return {
          ...item,
          kategori: categoryFromMizanOrAuto,
        };
      }),
    }));

    const processedInvoicesToReplace = invoicesToReplace.map((r) => ({
      oldId: r.oldId,
      newInvoice: {
        ...r.newInvoice,
        items: r.newInvoice.items.map((item) => {
          const pName = item.urunHizmetAdi || '';
          const categoryFromMizanOrAuto = inferCategoryForProduct(
            pName,
            mizanCategories,
            mizanStockItems
          );
          return {
            ...item,
            kategori: categoryFromMizanOrAuto,
          };
        }),
      },
    }));

    const allNewProcessed = [
      ...processedInvoicesToAdd,
      ...processedInvoicesToReplace.map((r) => r.newInvoice),
    ];

    // Update Mizan stock items' KDV rates if matching
    let updatedMizanCount = 0;
    setMizanStockItems((prevStock) => {
      if (prevStock.length === 0) return prevStock;

      const productKdvUpdates = new Map<string, number>();
      allNewProcessed.forEach((inv) => {
        inv.items.forEach((it) => {
          const name = (it.urunHizmetAdi || '').trim();
          if (name && it.kdvOrani !== undefined && it.kdvOrani !== null) {
            productKdvUpdates.set(toTurkishLower(name), Number(it.kdvOrani));
          }
        });
      });

      if (productKdvUpdates.size === 0) return prevStock;

      let changed = false;
      const updatedStock = prevStock.map((st) => {
        const stLower = toTurkishLower(st.urunAdi || '').trim();
        let newKdv: number | undefined = undefined;

        if (productKdvUpdates.has(stLower)) {
          newKdv = productKdvUpdates.get(stLower);
        } else {
          for (const [pNameLower, kdvVal] of productKdvUpdates.entries()) {
            if (findMizanStockMatch(pNameLower, [st])) {
              newKdv = kdvVal;
              break;
            }
          }
        }

        if (newKdv !== undefined && st.kdvOrani !== newKdv) {
          changed = true;
          updatedMizanCount++;
          const newDeger = st.toplamDeger;
          const newKdvTutari = (newDeger * newKdv) / 100;
          return {
            ...st,
            kdvOrani: newKdv,
            toplamKdvTutari: newKdvTutari,
            toplamKdvDahilDeger: newDeger + newKdvTutari,
          };
        }
        return st;
      });

      return changed ? updatedStock : prevStock;
    });

    setInvoices((prev) => {
      let current = [...prev];
      processedInvoicesToReplace.forEach((r) => {
        current = current.map((inv) => (inv.id === r.oldId ? r.newInvoice : inv));
      });
      return [...processedInvoicesToAdd, ...current];
    });

    if (allNewProcessed.length > 0) {
      setActiveInvoiceId(allNewProcessed[0].id);
    }

    const totalCount = allNewProcessed.length;
    if (updatedMizanCount > 0) {
      showToast(`${totalCount} fatura işlendi. Mizandaki ${updatedMizanCount} ürünün KDV oranı güncellendi!`);
    } else {
      showToast(`${totalCount} fatura başarıyla listeye eklendi!`);
    }
  };

  // When new invoices are parsed from PDF / scanned
  const handleInvoicesParsed = (newInvoices: ProcessedInvoice[]) => {
    // Check for duplicate invoices
    const duplicates: DuplicateMatch[] = [];
    const nonDuplicates: ProcessedInvoice[] = [];

    newInvoices.forEach((newInv) => {
      const newFaturaNo = (newInv.metadata?.faturaNo || '').trim().toLowerCase();
      const newEttn = (newInv.metadata?.ettn || '').trim().toLowerCase();
      const newFileName = (newInv.fileName || '').trim().toLowerCase();

      const matched = invoices.find((existInv) => {
        const existFaturaNo = (existInv.metadata?.faturaNo || '').trim().toLowerCase();
        const existEttn = (existInv.metadata?.ettn || '').trim().toLowerCase();
        const existFileName = (existInv.fileName || '').trim().toLowerCase();

        if (newFaturaNo && existFaturaNo && newFaturaNo === existFaturaNo && !newFaturaNo.startsWith('fat-')) {
          return true;
        }
        if (newEttn && existEttn && newEttn === existEttn) {
          return true;
        }
        if (newFileName && existFileName && newFileName === existFileName && newInv.fileSize === existInv.fileSize) {
          return true;
        }
        return false;
      });

      if (matched) {
        let matchReason: 'faturaNo' | 'ettn' | 'fileName' = 'faturaNo';
        const existFaturaNo = (matched.metadata?.faturaNo || '').trim().toLowerCase();
        const existEttn = (matched.metadata?.ettn || '').trim().toLowerCase();
        if (newFaturaNo && existFaturaNo && newFaturaNo === existFaturaNo && !newFaturaNo.startsWith('fat-')) {
          matchReason = 'faturaNo';
        } else if (newEttn && existEttn && newEttn === existEttn) {
          matchReason = 'ettn';
        } else {
          matchReason = 'fileName';
        }

        duplicates.push({
          newInvoice: newInv,
          existingInvoice: matched,
          matchReason,
          action: 'skip',
        });
      } else {
        nonDuplicates.push(newInv);
      }
    });

    if (duplicates.length > 0) {
      setPendingDuplicates(duplicates);
      setPendingNonDuplicates(nonDuplicates);
    } else {
      applyProcessedInvoices(newInvoices);
    }
  };

  const handleConfirmDuplicates = (decisions: DuplicateMatch[]) => {
    const invoicesToAdd: ProcessedInvoice[] = [...pendingNonDuplicates];
    const invoicesToReplace: { oldId: string; newInvoice: ProcessedInvoice }[] = [];

    decisions.forEach((d) => {
      if (d.action === 'keepBoth') {
        invoicesToAdd.push(d.newInvoice);
      } else if (d.action === 'replace') {
        invoicesToReplace.push({ oldId: d.existingInvoice.id, newInvoice: d.newInvoice });
      }
    });

    setPendingDuplicates(null);
    setPendingNonDuplicates([]);

    if (invoicesToAdd.length > 0 || invoicesToReplace.length > 0) {
      applyProcessedInvoices(invoicesToAdd, invoicesToReplace);
    } else {
      showToast('Mükerrer faturalar atlandı, listeye ekleme yapılmadı.');
    }
  };

  const handleAttachDocument = (invoiceId: string, dataUrl: string, fileType: string) => {
    saveInvoiceDocument(invoiceId, dataUrl);
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === invoiceId ? { ...inv, fileDataUrl: dataUrl, fileType } : inv))
    );
    showToast('Fatura belgesi başarıyla güncellendi.');
  };

  // Clear all
  const handleClearAll = () => {
    setInvoices([]);
    setMasterExcelRows([]);
    setMizanStockItems([]);
    setMizanMovements([]);
    setActiveInvoiceId('');
    showToast('Tüm faturalar, Excel tablosu ve Mizan temizlendi.');
  };

  // Active invoice helper
  const activeInvoiceIndex = useMemo(() => {
    return invoices.findIndex((i) => i.id === activeInvoiceId);
  }, [invoices, activeInvoiceId]);

  const activeInvoice = useMemo(() => {
    if (activeInvoiceIndex >= 0) return invoices[activeInvoiceIndex];
    return invoices[0];
  }, [invoices, activeInvoiceIndex]);

  const handleNextInvoice = () => {
    if (activeInvoiceIndex < invoices.length - 1) {
      setActiveInvoiceId(invoices[activeInvoiceIndex + 1].id);
    }
  };

  const handlePrevInvoice = () => {
    if (activeInvoiceIndex > 0) {
      setActiveInvoiceId(invoices[activeInvoiceIndex - 1].id);
    }
  };

  // Transfer items from Middle Editor to Right Excel Table
  const handleTransferItemsToExcel = (
    itemsToTransfer: InvoiceItem[],
    sourceInvoice: ProcessedInvoice
  ) => {
    const newMasterRows: MasterExcelRow[] = itemsToTransfer.map((item) => ({
      id: `excel-row-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      urunAdi: item.urunHizmetAdi,
      miktar: item.miktar,
      birim: item.birim || 'Adet',
      fiyat: item.birimFiyat,
      kdvOrani: item.kdvOrani ?? 20,
      kategori: item.kategori || 'Diğer',
      sourceInvoiceId: sourceInvoice.id,
      sourceInvoiceNo: sourceInvoice.metadata.faturaNo,
    }));

    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== sourceInvoice.id) return inv;
        const transferredItemIds = itemsToTransfer.map((x) => x.id);
        const updatedItems = inv.items.map((it) =>
          transferredItemIds.includes(it.id) ? { ...it, isTransferred: true } : it
        );
        return { ...inv, items: updatedItems };
      })
    );

    setMasterExcelRows((prev) => [...prev, ...newMasterRows]);
    showToast(
      `${itemsToTransfer.length} ürün sağdaki Excel tablosuna aktarıldı!`
    );
  };

  // Transfer all items from all invoices
  const handleTransferAllInvoicesToExcel = () => {
    const allNewRows: MasterExcelRow[] = [];

    invoices.forEach((inv) => {
      inv.items.forEach((item) => {
        allNewRows.push({
          id: `excel-row-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
          urunAdi: item.urunHizmetAdi,
          miktar: item.miktar,
          birim: item.birim || 'Adet',
          fiyat: item.birimFiyat,
          kdvOrani: item.kdvOrani ?? 20,
          kategori: item.kategori || 'Diğer',
          sourceInvoiceId: inv.id,
          sourceInvoiceNo: inv.metadata.faturaNo,
        });
      });
    });

    setInvoices((prev) =>
      prev.map((inv) => ({
        ...inv,
        items: inv.items.map((it) => ({ ...it, isTransferred: true })),
      }))
    );

    setMasterExcelRows(allNewRows);
    showToast(`Tüm faturalardaki ${allNewRows.length} ürün Excel tablosuna aktarıldı!`);
  };

  // Active company and active year filtered Mizan Stock Items & Movements
  const activeCompanyStockItems = useMemo(() => {
    return mizanStockItems.filter((st) => {
      const c = st.companyName || DEFAULT_COMPANIES[0];
      const y = st.year || 2026;
      return c === activeCompany && y === activeYear;
    });
  }, [mizanStockItems, activeCompany, activeYear]);

  const activeCompanyMovements = useMemo(() => {
    return mizanMovements.filter((mov) => {
      const c = mov.companyName || DEFAULT_COMPANIES[0];
      const y = mov.year || 2026;
      return c === activeCompany && y === activeYear;
    });
  }, [mizanMovements, activeCompany, activeYear]);

  // Transfer previous year remaining stock balances to active year as opening balance
  const handleTransferPreviousYearBalances = () => {
    const prevYear = activeYear - 1;
    const prevYearItems = mizanStockItems.filter((st) => {
      const c = st.companyName || DEFAULT_COMPANIES[0];
      const y = st.year || 2026;
      return c === activeCompany && y === prevYear && st.kalanMiktar > 0;
    });

    if (prevYearItems.length === 0) {
      showToast(`${prevYear} yılına ait aktarılacak pozitif stok bakiyesi bulunamadı.`);
      return;
    }

    const today = `${activeYear}-01-01`;
    const newMovements: MizanMovement[] = [];

    const getStockKey = (uAdi: string, brm: string) =>
      `${toTurkishLower(uAdi || '').trim()}_${toTurkishLower(brm || 'Adet').trim()}`;

    setMizanStockItems((prevStock) => {
      // Keep other companies / years
      const otherStock = prevStock.filter((st) => {
        const c = st.companyName || DEFAULT_COMPANIES[0];
        const y = st.year || 2026;
        return !(c === activeCompany && y === activeYear);
      });

      const activeStock = prevStock.filter((st) => {
        const c = st.companyName || DEFAULT_COMPANIES[0];
        const y = st.year || 2026;
        return c === activeCompany && y === activeYear;
      });

      const stockMap = new Map<string, MizanStockItem>();
      activeStock.forEach((st) => stockMap.set(getStockKey(st.urunAdi, st.birim), { ...st }));

      prevYearItems.forEach((item) => {
        const key = getStockKey(item.urunAdi, item.birim);
        const miktar = item.kalanMiktar;
        const fiyat = item.ortalamaBirimFiyat;
        const tutar = miktar * fiyat;
        const kdv = Number(item.kdvOrani) || 20;
        const kdvTutari = (tutar * kdv) / 100;

        newMovements.push({
          id: `mov-devir-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          companyName: activeCompany,
          year: activeYear,
          tarih: today,
          islemTipi: 'giris',
          urunAdi: item.urunAdi,
          kategori: item.kategori,
          miktar: miktar,
          birim: item.birim,
          birimFiyat: fiyat,
          kdvOrani: kdv,
          kdvTutari: kdvTutari,
          toplamTutar: tutar,
          faturaNo: `${prevYear} Yılı Devir Bakiyesi`,
        });

        if (stockMap.has(key)) {
          const stItem = stockMap.get(key)!;
          stItem.toplamGiris += miktar;
          stItem.kalanMiktar = stItem.toplamGiris - stItem.toplamCikis;
          stItem.kdvOrani = kdv;
          stItem.toplamDeger = stItem.kalanMiktar * stItem.ortalamaBirimFiyat;
          stItem.toplamKdvTutari = (stItem.toplamDeger * kdv) / 100;
          stItem.toplamKdvDahilDeger = stItem.toplamDeger + stItem.toplamKdvTutari;
          stItem.hareketSayisi += 1;
        } else {
          stockMap.set(key, {
            id: `stock-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            companyName: activeCompany,
            year: activeYear,
            urunAdi: item.urunAdi,
            kategori: item.kategori,
            birim: item.birim,
            toplamGiris: miktar,
            toplamCikis: 0,
            kalanMiktar: miktar,
            ortalamaBirimFiyat: fiyat,
            kdvOrani: kdv,
            toplamDeger: tutar,
            toplamKdvTutari: kdvTutari,
            toplamKdvDahilDeger: tutar + kdvTutari,
            sonIslemTarihi: today,
            hareketSayisi: 1,
          });
        }
      });

      return [...otherStock, ...Array.from(stockMap.values())];
    });

    setMizanMovements((prev) => [...newMovements, ...prev]);
    showToast(`✅ ${prevYear} yılından ${prevYearItems.length} ürünün devir bakiyesi ${activeYear} yılına başarıyla aktarıldı!`);
  };

  // 🌟 MİZANA STOK EKLE (+) ACTION
  const handleAddToMizan = (rowsToAdd: MasterExcelRow[]) => {
    if (rowsToAdd.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const newMovements: MizanMovement[] = [];

    const getStockKey = (uAdi: string, brm: string) =>
      `${toTurkishLower(uAdi || '').trim()}_${toTurkishLower(brm || 'Adet').trim()}`;

    setMizanStockItems((prevStock) => {
      // Keep items from other companies / years
      const otherStock = prevStock.filter((st) => {
        const c = st.companyName || DEFAULT_COMPANIES[0];
        const y = st.year || 2026;
        return !(c === activeCompany && y === activeYear);
      });

      const activeStock = prevStock.filter((st) => {
        const c = st.companyName || DEFAULT_COMPANIES[0];
        const y = st.year || 2026;
        return c === activeCompany && y === activeYear;
      });

      const stockMap = new Map<string, MizanStockItem>();
      activeStock.forEach((st) => stockMap.set(getStockKey(st.urunAdi, st.birim), { ...st }));

      rowsToAdd.forEach((row) => {
        const uAdi = row.urunAdi || '';
        const brm = row.birim || 'Adet';
        let key = getStockKey(uAdi, brm);
        const miktar = Number(row.miktar) || 0;
        const fiyat = Number(row.fiyat) || 0;
        const kdv = row.kdvOrani !== undefined && row.kdvOrani !== null ? Number(row.kdvOrani) : 20;
        const tutar = miktar * fiyat;
        const kdvTutari = (tutar * kdv) / 100;

        let rowCat = row.kategori;
        const mizanMatch = findMizanStockMatch(uAdi, Array.from(stockMap.values()));
        if (mizanMatch) {
          if (mizanMatch.kategori) {
            rowCat = mizanMatch.kategori;
          }
          const matchKey = getStockKey(mizanMatch.urunAdi, mizanMatch.birim);
          if (stockMap.has(matchKey)) {
            key = matchKey;
          }
        } else if (!rowCat || rowCat.trim() === '' || rowCat === 'Genel Gider' || rowCat === 'Diğer') {
          rowCat = inferCategoryForProduct(uAdi, mizanCategories, Array.from(stockMap.values()));
        }

        newMovements.push({
          id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          companyName: activeCompany,
          year: activeYear,
          tarih: today,
          islemTipi: 'giris',
          urunAdi: uAdi,
          kategori: rowCat,
          miktar: miktar,
          birim: brm,
          birimFiyat: fiyat,
          kdvOrani: kdv,
          kdvTutari: kdvTutari,
          toplamTutar: tutar,
          faturaNo: row.sourceInvoiceNo || 'Fatura Girişi',
        });

        if (stockMap.has(key)) {
          const item = stockMap.get(key)!;
          const newAvgPrice = calculateWeightedAverageCost(
            item.kalanMiktar,
            item.ortalamaBirimFiyat,
            miktar,
            fiyat
          );
          item.toplamGiris += miktar;
          item.kalanMiktar = item.toplamGiris - item.toplamCikis;
          if (!item.kategori || item.kategori === 'Genel Gider' || item.kategori === 'Diğer') {
            item.kategori = rowCat;
          }
          item.ortalamaBirimFiyat = newAvgPrice;
          item.kdvOrani = kdv;
          const values = calculateMizanItemValues(item.kalanMiktar, item.ortalamaBirimFiyat, kdv);
          item.toplamDeger = values.toplamDeger;
          item.toplamKdvTutari = values.toplamKdvTutari;
          item.toplamKdvDahilDeger = values.toplamKdvDahilDeger;
          item.sonIslemTarihi = today;
          item.hareketSayisi += 1;
        } else {
          const values = calculateMizanItemValues(miktar, fiyat, kdv);
          stockMap.set(key, {
            id: `stock-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            companyName: activeCompany,
            year: activeYear,
            urunAdi: uAdi,
            kategori: rowCat,
            birim: brm,
            toplamGiris: miktar,
            toplamCikis: 0,
            kalanMiktar: miktar,
            ortalamaBirimFiyat: fiyat,
            kdvOrani: kdv,
            toplamDeger: values.toplamDeger,
            toplamKdvTutari: values.toplamKdvTutari,
            toplamKdvDahilDeger: values.toplamKdvDahilDeger,
            sonIslemTarihi: today,
            hareketSayisi: 1,
          });
        }
      });

      return [...otherStock, ...Array.from(stockMap.values())];
    });

    setMizanMovements((prev) => [...newMovements, ...prev]);
    showToast(`✅ ${rowsToAdd.length} kalem ürün ${activeCompany} (${activeYear}) Mizanına Stok Girişi (+) olarak eklendi!`);
  };

  // 🌟 MİZANA STOK DÜŞÜR (-) ACTION
  const handleDeductFromMizan = (rowsToDeduct: MasterExcelRow[]) => {
    if (rowsToDeduct.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const newMovements: MizanMovement[] = [];

    const getStockKey = (uAdi: string, brm: string) =>
      `${toTurkishLower(uAdi || '').trim()}_${toTurkishLower(brm || 'Adet').trim()}`;

    setMizanStockItems((prevStock) => {
      const otherStock = prevStock.filter((st) => {
        const c = st.companyName || DEFAULT_COMPANIES[0];
        const y = st.year || 2026;
        return !(c === activeCompany && y === activeYear);
      });

      const activeStock = prevStock.filter((st) => {
        const c = st.companyName || DEFAULT_COMPANIES[0];
        const y = st.year || 2026;
        return c === activeCompany && y === activeYear;
      });

      const stockMap = new Map<string, MizanStockItem>();
      activeStock.forEach((st) => stockMap.set(getStockKey(st.urunAdi, st.birim), { ...st }));

      rowsToDeduct.forEach((row) => {
        const uAdi = row.urunAdi || '';
        const brm = row.birim || 'Adet';
        let key = getStockKey(uAdi, brm);
        const miktar = Number(row.miktar) || 0;
        const fiyat = Number(row.fiyat) || 0;
        const kdv = row.kdvOrani !== undefined && row.kdvOrani !== null ? Number(row.kdvOrani) : 20;
        const tutar = miktar * fiyat;
        const kdvTutari = (tutar * kdv) / 100;

        let rowCat = row.kategori;
        const mizanMatch = findMizanStockMatch(uAdi, Array.from(stockMap.values()));
        if (mizanMatch) {
          if (mizanMatch.kategori) {
            rowCat = mizanMatch.kategori;
          }
          const matchKey = getStockKey(mizanMatch.urunAdi, mizanMatch.birim);
          if (stockMap.has(matchKey)) {
            key = matchKey;
          }
        } else if (!rowCat || rowCat.trim() === '' || rowCat === 'Genel Gider' || rowCat === 'Diğer') {
          rowCat = inferCategoryForProduct(uAdi, mizanCategories, Array.from(stockMap.values()));
        }

        newMovements.push({
          id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          companyName: activeCompany,
          year: activeYear,
          tarih: today,
          islemTipi: 'cikis',
          urunAdi: uAdi,
          kategori: rowCat,
          miktar: miktar,
          birim: brm,
          birimFiyat: fiyat,
          kdvOrani: kdv,
          kdvTutari: kdvTutari,
          toplamTutar: tutar,
          faturaNo: row.sourceInvoiceNo || 'Çıkış / Satış',
        });

        if (stockMap.has(key)) {
          const item = stockMap.get(key)!;
          item.toplamCikis += miktar;
          item.kalanMiktar = item.toplamGiris - item.toplamCikis;
          if (fiyat !== 0 && item.ortalamaBirimFiyat === 0) {
            item.ortalamaBirimFiyat = fiyat;
          }
          item.kdvOrani = kdv;
          const values = calculateMizanItemValues(item.kalanMiktar, item.ortalamaBirimFiyat, kdv);
          item.toplamDeger = values.toplamDeger;
          item.toplamKdvTutari = values.toplamKdvTutari;
          item.toplamKdvDahilDeger = values.toplamKdvDahilDeger;
          item.sonIslemTarihi = today;
          item.hareketSayisi += 1;
        } else {
          // If not in stock yet, record negative stock balance
          const values = calculateMizanItemValues(-miktar, fiyat, kdv);
          stockMap.set(key, {
            id: `stock-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            companyName: activeCompany,
            year: activeYear,
            urunAdi: uAdi,
            kategori: rowCat,
            birim: brm,
            toplamGiris: 0,
            toplamCikis: miktar,
            kalanMiktar: -miktar,
            ortalamaBirimFiyat: fiyat,
            kdvOrani: kdv,
            toplamDeger: values.toplamDeger,
            toplamKdvTutari: values.toplamKdvTutari,
            toplamKdvDahilDeger: values.toplamKdvDahilDeger,
            sonIslemTarihi: today,
            hareketSayisi: 1,
          });
        }
      });

      return [...otherStock, ...Array.from(stockMap.values())];
    });

    setMizanMovements((prev) => [...newMovements, ...prev]);
    showToast(`🔻 ${rowsToDeduct.length} kalem ürün ${activeCompany} (${activeYear}) Mizanından düşürüldü!`);
  };

  // Manual stock movement from Mizan view
  const handleAddManualMovement = (mov: Omit<MizanMovement, 'id' | 'tarih' | 'toplamTutar'>) => {
    const today = new Date().toISOString().slice(0, 10);
    const tutar = mov.miktar * mov.birimFiyat;
    const kdv = mov.kdvOrani !== undefined && mov.kdvOrani !== null ? Number(mov.kdvOrani) : 20;
    const kdvTutari = (tutar * kdv) / 100;

    const newMov: MizanMovement = {
      ...mov,
      id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      companyName: activeCompany,
      year: activeYear,
      tarih: today,
      kdvOrani: kdv,
      kdvTutari: kdvTutari,
      toplamTutar: tutar,
    };

    setMizanMovements((prev) => [newMov, ...prev]);

    const getStockKey = (uAdi: string, brm: string) =>
      `${toTurkishLower(uAdi || '').trim()}_${toTurkishLower(brm || 'Adet').trim()}`;

    setMizanStockItems((prevStock) => {
      const otherStock = prevStock.filter((st) => {
        const c = st.companyName || DEFAULT_COMPANIES[0];
        const y = st.year || 2026;
        return !(c === activeCompany && y === activeYear);
      });

      const activeStock = prevStock.filter((st) => {
        const c = st.companyName || DEFAULT_COMPANIES[0];
        const y = st.year || 2026;
        return c === activeCompany && y === activeYear;
      });

      const stockMap = new Map<string, MizanStockItem>();
      activeStock.forEach((st) => stockMap.set(getStockKey(st.urunAdi, st.birim), { ...st }));

      const key = getStockKey(mov.urunAdi, mov.birim);
      if (stockMap.has(key)) {
        const item = stockMap.get(key)!;
        if (mov.kategori) {
          item.kategori = mov.kategori;
        }
        if (mov.islemTipi === 'giris') {
          const newAvg = calculateWeightedAverageCost(
            item.kalanMiktar,
            item.ortalamaBirimFiyat,
            mov.miktar,
            mov.birimFiyat
          );
          item.toplamGiris += mov.miktar;
          item.ortalamaBirimFiyat = newAvg;
        } else {
          item.toplamCikis += mov.miktar;
          if (mov.birimFiyat > 0 && item.ortalamaBirimFiyat === 0) {
            item.ortalamaBirimFiyat = mov.birimFiyat;
          }
        }
        item.kdvOrani = kdv;
        item.kalanMiktar = item.toplamGiris - item.toplamCikis;
        const values = calculateMizanItemValues(item.kalanMiktar, item.ortalamaBirimFiyat, kdv);
        item.toplamDeger = values.toplamDeger;
        item.toplamKdvTutari = values.toplamKdvTutari;
        item.toplamKdvDahilDeger = values.toplamKdvDahilDeger;
        item.sonIslemTarihi = today;
        item.hareketSayisi += 1;
      } else {
        const isGiris = mov.islemTipi === 'giris';
        const qty = isGiris ? mov.miktar : -mov.miktar;
        const values = calculateMizanItemValues(qty, mov.birimFiyat, kdv);
        stockMap.set(key, {
          id: `stock-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          companyName: activeCompany,
          year: activeYear,
          urunAdi: mov.urunAdi,
          kategori: mov.kategori,
          birim: mov.birim,
          toplamGiris: isGiris ? mov.miktar : 0,
          toplamCikis: isGiris ? 0 : mov.miktar,
          kalanMiktar: qty,
          ortalamaBirimFiyat: mov.birimFiyat,
          kdvOrani: kdv,
          toplamDeger: values.toplamDeger,
          toplamKdvTutari: values.toplamKdvTutari,
          toplamKdvDahilDeger: values.toplamKdvDahilDeger,
          sonIslemTarihi: today,
          hareketSayisi: 1,
        });
      }

      return [...otherStock, ...Array.from(stockMap.values())];
    });

    showToast(`Manuel stok hareketi ${activeCompany} (${activeYear}) Mizanına kaydedildi.`);
  };

  const handleClearMizan = () => {
    // Only clear for activeCompany and activeYear
    setMizanStockItems((prev) =>
      prev.filter((st) => {
        const c = st.companyName || DEFAULT_COMPANIES[0];
        const y = st.year || 2026;
        return !(c === activeCompany && y === activeYear);
      })
    );
    setMizanMovements((prev) =>
      prev.filter((mov) => {
        const c = mov.companyName || DEFAULT_COMPANIES[0];
        const y = mov.year || 2026;
        return !(c === activeCompany && y === activeYear);
      })
    );
    showToast(`${activeCompany} şirketi ${activeYear} yılı mizanı sıfırlandı.`);
  };

  // Mizan stoklarını ve hareketlerini sıfırdan denetleyip kuruş hassasiyetinde yeniden hesaplama
  const handleAuditAndRecalculateMizan = () => {
    const result = auditAndRecalculateStockFromMovements(
      mizanStockItems,
      mizanMovements,
      activeCompany,
      activeYear
    );
    setMizanStockItems(result.recalculatedStock);
    showToast(
      `⚖️ ${activeCompany} (${activeYear}) Mizanı denetlendi: ${result.itemCount} stok kalemi doğrulandı (Net: ₺${result.totalMatrah.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}, KDV: ₺${result.totalKdv.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}, Brüt: ₺${result.totalBrut.toLocaleString('tr-TR', { minimumFractionDigits: 2 })})`
    );
  };

  const handleIssueInvoiceFromMizan = (newInvoice: ProcessedInvoice, deductedRows: MasterExcelRow[]) => {
    setInvoices((prev) => [newInvoice, ...prev]);
    setActiveInvoiceId(newInvoice.id);
    if (deductedRows.length > 0) {
      handleDeductFromMizan(deductedRows);
    }
    showToast(`✅ Satış faturası kesildi (${newInvoice.metadata.faturaNo}) ve stoktan düşüldü!`);
  };

  const handleDeleteMizanStockItem = (id: string) => {
    setMizanStockItems((prev) => prev.filter((i) => i.id !== id));
    showToast('Stok kaydı kaldırıldı.');
  };

  const handleUpdateMizanStockItem = (id: string, updatedFields: Partial<MizanStockItem>) => {
    setMizanStockItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, ...updatedFields };
          const kMiktar = updated.kalanMiktar !== undefined ? Number(updated.kalanMiktar) : Number(item.kalanMiktar) || 0;
          const oFiyat = updated.ortalamaBirimFiyat !== undefined ? Number(updated.ortalamaBirimFiyat) : Number(item.ortalamaBirimFiyat) || 0;
          const kdv = updated.kdvOrani !== undefined ? Number(updated.kdvOrani) : (item.kdvOrani ?? 20);
          
          updated.kalanMiktar = kMiktar;
          updated.ortalamaBirimFiyat = oFiyat;
          updated.kdvOrani = kdv;
          const values = calculateMizanItemValues(kMiktar, oFiyat, kdv);
          updated.toplamDeger = values.toplamDeger;
          updated.toplamKdvTutari = values.toplamKdvTutari;
          updated.toplamKdvDahilDeger = values.toplamKdvDahilDeger;
          return updated;
        }
        return item;
      })
    );
    showToast('Mizan stok kalemi güncellendi.');
  };

  const handleReconcileNegativeStock = (
    negativeItemId: string,
    targetStockItemId: string,
    quantityToDeduct: number,
    note?: string
  ) => {
    const today = new Date().toISOString().slice(0, 10);
    const negativeItem = mizanStockItems.find((s) => s.id === negativeItemId);
    const targetItem = mizanStockItems.find((s) => s.id === targetStockItemId);

    if (!negativeItem || !targetItem) return;

    // 1. Update stock items: reduce target quantity, remove negative item
    setMizanStockItems((prev) => {
      return prev
        .filter((s) => s.id !== negativeItemId)
        .map((s) => {
          if (s.id === targetStockItemId) {
            const newCikis = s.toplamCikis + quantityToDeduct;
            const newKalan = s.toplamGiris - newCikis;
            const kdv = s.kdvOrani ?? 20;
            const values = calculateMizanItemValues(newKalan, s.ortalamaBirimFiyat, kdv);
            return {
              ...s,
              toplamCikis: newCikis,
              kalanMiktar: newKalan,
              toplamDeger: values.toplamDeger,
              toplamKdvTutari: values.toplamKdvTutari,
              toplamKdvDahilDeger: values.toplamKdvDahilDeger,
              sonIslemTarihi: today,
              hareketSayisi: s.hareketSayisi + 1,
            };
          }
          return s;
        });
    });

    // 2. Add an audit movement for transparency
    const targetKdv = targetItem.kdvOrani ?? 20;
    const tutar = quantityToDeduct * targetItem.ortalamaBirimFiyat;
    const kdvTutari = (tutar * targetKdv) / 100;
    const newMov: MizanMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      companyName: activeCompany,
      year: activeYear,
      tarih: today,
      islemTipi: 'cikis',
      urunAdi: targetItem.urunAdi,
      kategori: targetItem.kategori,
      miktar: quantityToDeduct,
      birim: targetItem.birim,
      birimFiyat: targetItem.ortalamaBirimFiyat,
      kdvOrani: targetKdv,
      kdvTutari: kdvTutari,
      toplamTutar: tutar,
      faturaNo: note || `Stok Düzeltme (${negativeItem.urunAdi} Mahsubu)`,
    };
    setMizanMovements((prev) => [newMov, ...prev]);

    showToast(`⚖️ Stok düzeltildi: "${negativeItem.urunAdi}" silindi, ${quantityToDeduct} ${targetItem.birim} "${targetItem.urunAdi}" stokundan düşüldü.`);
  };

  // Middle Editor handlers
  const handleUpdateItem = (
    invoiceId: string,
    itemId: string,
    field: keyof InvoiceItem,
    value: any
  ) => {
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== invoiceId) return inv;
        const updatedItems = inv.items.map((it) =>
          it.id === itemId ? { ...it, [field]: value } : it
        );
        return { ...inv, items: updatedItems };
      })
    );
  };

  const handleAddItem = (invoiceId: string) => {
    const targetId = invoiceId || activeInvoice?.id;
    if (!targetId) return;

    const newItem: InvoiceItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      siraNo: (activeInvoice?.items.length || 0) + 1,
      urunHizmetAdi: 'Yeni Ürün / Hizmet',
      miktar: 1,
      birim: 'Adet',
      birimFiyat: 0,
      kdvOrani: 20,
      kdvTutari: 0,
      satirToplami: 0,
      kategori: 'Genel Gider',
      paraBirimi: 'TRY',
      isTransferred: false,
    };

    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== targetId) return inv;
        return { ...inv, items: [...inv.items, newItem] };
      })
    );
    showToast('Yeni satır eklendi.');
  };

  const handleDeleteItem = (invoiceId: string, itemId: string) => {
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== invoiceId) return inv;
        return { ...inv, items: inv.items.filter((it) => it.id !== itemId) };
      })
    );
    showToast('Satır başarıyla silindi.');
  };

  const handleDeleteMultipleItems = (invoiceId: string, itemIds: string[]) => {
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== invoiceId) return inv;
        return { ...inv, items: inv.items.filter((it) => !itemIds.includes(it.id)) };
      })
    );
    showToast(`${itemIds.length} satır silindi.`);
  };

  const handleDuplicateItem = (invoiceId: string, item: InvoiceItem) => {
    const duplicate: InvoiceItem = {
      ...item,
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      siraNo: item.siraNo + 1,
      urunHizmetAdi: `${item.urunHizmetAdi} (Kopya)`,
      isTransferred: false,
    };

    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== invoiceId) return inv;
        return { ...inv, items: [...inv.items, duplicate] };
      })
    );
    showToast('Satır kopyalandı.');
  };

  const handleDeleteInvoice = (invoiceId: string) => {
    const remaining = invoices.filter((i) => i.id !== invoiceId);
    setInvoices(remaining);
    if (activeInvoiceId === invoiceId && remaining.length > 0) {
      setActiveInvoiceId(remaining[0].id);
    }
    showToast('Fatura listeden kaldırıldı.');
  };

  // Right Table handlers
  const handleUpdateMasterExcelRow = (
    rowId: string,
    field: keyof MasterExcelRow,
    value: any
  ) => {
    setMasterExcelRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r))
    );
  };

  const handleDeleteMasterExcelRow = (rowId: string) => {
    setMasterExcelRows((prev) => prev.filter((r) => r.id !== rowId));
    showToast('Satır Excel tablosundan silindi.');
  };

  const handleDeleteMultipleMasterExcelRows = (rowIds: string[]) => {
    setMasterExcelRows((prev) => prev.filter((r) => !rowIds.includes(r.id)));
    showToast(`${rowIds.length} satır Excel tablosundan silindi.`);
  };

  const handleAddMasterExcelRow = () => {
    const newRow: MasterExcelRow = {
      id: `excel-row-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      urunAdi: 'Yeni Ürün Kalemi',
      miktar: 1,
      birim: 'Adet',
      fiyat: 0,
      kdvOrani: 20,
      kategori: 'Genel Gider',
    };
    setMasterExcelRows((prev) => [...prev, newRow]);
    showToast('Excel tablosuna yeni boş satır eklendi.');
  };

  const handleClearAllMasterExcelRows = () => {
    setMasterExcelRows([]);
    showToast('Excel tablosundaki tüm satırlar temizlendi.');
  };

  const handleDirectMasterExcelExport = () => {
    if (masterExcelRows.length === 0) {
      showToast('Excel tablosunda henüz ürün bulunmuyor. Önce orta kısımdan aktarın.');
      return;
    }
    exportMasterExcelFile(masterExcelRows);
    showToast('Excel dosyası (.xlsx) başarıyla indirildi!');
  };

  const handleCopyClipboard = async () => {
    if (masterExcelRows.length === 0) return;
    const success = await copyMasterExcelRowsToClipboard(masterExcelRows);
    if (success) {
      setCopySuccess(true);
      showToast('Excel tablosu panoya kopyalandı! Excel programında Ctrl+V yapabilirsiniz.');
      setTimeout(() => setCopySuccess(false), 2500);
    }
  };

  // 🌟 VERİLERİ YEDEKLE (JSON EXPORT - Şirketler & Yıllar Dahil - UTF-8 Güvenli)
  const handleBackupData = () => {
    const backupData = {
      version: 2,
      backupDate: new Date().toISOString(),
      invoices,
      masterExcelRows,
      mizanStockItems,
      mizanMovements,
      mizanCategories,
      companies,
      activeCompany,
      years,
      activeYear,
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    const safeCompName = toTurkishLower(activeCompany).replace(/[^a-z0-9ğüşıöç]/gi, '_');
    downloadAnchor.download = `mizan_yedek_${safeCompName}_${activeYear}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
    showToast(`💾 Tüm şirketler, mali yıllar (${activeYear}) ve mizan stokları UTF-8 olarak yedeklendi!`);
  };

  // 🌟 YEDEKTEN GERİ YÜKLE (PAYLOAD)
  const handleRestoreBackupPayload = (parsed: any) => {
    if (!parsed || typeof parsed !== 'object') {
      showToast('❌ Geçersiz veya boş yedek dosyası.');
      return;
    }

    try {
      const newInvoices = Array.isArray(parsed.invoices)
        ? parsed.invoices.map((inv: any) => ({
            ...inv,
            items: Array.isArray(inv.items)
              ? inv.items.map((item: any) => ({
                  ...item,
                  kdvOrani: item.kdvOrani !== undefined && item.kdvOrani !== null ? Number(item.kdvOrani) : 20,
                }))
              : [],
          }))
        : Array.isArray(parsed.faturaListesi)
        ? parsed.faturaListesi
        : null;

      const newExcelRows = Array.isArray(parsed.masterExcelRows)
        ? parsed.masterExcelRows.map((row: any) => ({
            ...row,
            kdvOrani: row.kdvOrani !== undefined && row.kdvOrani !== null ? Number(row.kdvOrani) : 20,
          }))
        : Array.isArray(parsed.excelRows)
        ? parsed.excelRows.map((row: any) => ({
            ...row,
            kdvOrani: row.kdvOrani !== undefined && row.kdvOrani !== null ? Number(row.kdvOrani) : 20,
          }))
        : null;

      const newMizanStock = Array.isArray(parsed.mizanStockItems)
        ? parsed.mizanStockItems.map((item: any) => ({
            ...item,
            kdvOrani: item.kdvOrani !== undefined && item.kdvOrani !== null ? Number(item.kdvOrani) : 20,
            toplamDeger: Number(item.toplamDeger) || (Number(item.kalanMiktar) || 0) * (Number(item.ortalamaBirimFiyat) || 0),
          }))
        : Array.isArray(parsed.mizanItems)
        ? parsed.mizanItems.map((item: any) => ({
            ...item,
            kdvOrani: item.kdvOrani !== undefined && item.kdvOrani !== null ? Number(item.kdvOrani) : 20,
            toplamDeger: Number(item.toplamDeger) || (Number(item.kalanMiktar) || 0) * (Number(item.ortalamaBirimFiyat) || 0),
          }))
        : Array.isArray(parsed.stoklar)
        ? parsed.stoklar.map((item: any) => ({
            ...item,
            kdvOrani: item.kdvOrani !== undefined && item.kdvOrani !== null ? Number(item.kdvOrani) : 20,
            toplamDeger: Number(item.toplamDeger) || (Number(item.kalanMiktar) || 0) * (Number(item.ortalamaBirimFiyat) || 0),
          }))
        : null;

      const newMovements = Array.isArray(parsed.mizanMovements)
        ? parsed.mizanMovements.map((mov: any) => ({
            ...mov,
            kdvOrani: mov.kdvOrani !== undefined && mov.kdvOrani !== null ? Number(mov.kdvOrani) : 20,
          }))
        : Array.isArray(parsed.movements)
        ? parsed.movements.map((mov: any) => ({
            ...mov,
            kdvOrani: mov.kdvOrani !== undefined && mov.kdvOrani !== null ? Number(mov.kdvOrani) : 20,
          }))
        : Array.isArray(parsed.hareketler)
        ? parsed.hareketler.map((mov: any) => ({
            ...mov,
            kdvOrani: mov.kdvOrani !== undefined && mov.kdvOrani !== null ? Number(mov.kdvOrani) : 20,
          }))
        : null;

      const newCategories =
        Array.isArray(parsed.mizanCategories) && parsed.mizanCategories.length > 0
          ? parsed.mizanCategories
          : Array.isArray(parsed.categories) && parsed.categories.length > 0
          ? parsed.categories
          : null;

      const newCompanies =
        Array.isArray(parsed.companies) && parsed.companies.length > 0
          ? parsed.companies
          : Array.isArray(parsed.sirketler) && parsed.sirketler.length > 0
          ? parsed.sirketler
          : null;

      const newActiveCompany = parsed.activeCompany || parsed.aktifSirket || null;

      const newYears =
        Array.isArray(parsed.years) && parsed.years.length > 0
          ? parsed.years
          : Array.isArray(parsed.yillar) && parsed.yillar.length > 0
          ? parsed.yillar
          : null;

      const newActiveYear = Number(parsed.activeYear || parsed.aktifYil) || null;

      if (newInvoices) {
        setInvoices(newInvoices);
        localStorage.setItem(STORAGE_INVOICES_KEY, JSON.stringify(newInvoices));
      }
      if (newExcelRows) {
        setMasterExcelRows(newExcelRows);
        localStorage.setItem(STORAGE_EXCEL_KEY, JSON.stringify(newExcelRows));
      }
      if (newMizanStock) {
        setMizanStockItems(newMizanStock);
        localStorage.setItem(STORAGE_MIZAN_STOCK_KEY, JSON.stringify(newMizanStock));
      }
      if (newMovements) {
        setMizanMovements(newMovements);
        localStorage.setItem(STORAGE_MIZAN_MOVEMENTS_KEY, JSON.stringify(newMovements));
      }
      if (newCategories) {
        setMizanCategories(newCategories);
        localStorage.setItem(STORAGE_MIZAN_CATEGORIES_KEY, JSON.stringify(newCategories));
      }
      if (newCompanies) {
        setCompanies(newCompanies);
        localStorage.setItem(STORAGE_COMPANIES_KEY, JSON.stringify(newCompanies));
      }
      if (newActiveCompany && typeof newActiveCompany === 'string') {
        setActiveCompany(newActiveCompany);
        localStorage.setItem(STORAGE_ACTIVE_COMPANY_KEY, newActiveCompany);
      }
      if (newYears) {
        setYears(newYears);
        localStorage.setItem(STORAGE_YEARS_KEY, JSON.stringify(newYears));
      }
      if (newActiveYear) {
        setActiveYear(newActiveYear);
        localStorage.setItem(STORAGE_ACTIVE_YEAR_KEY, String(newActiveYear));
      }

      showToast('✅ Yedek başarıyla geri yüklendi ve çalışma alanınız güncellendi!');
    } catch (err: any) {
      console.error('handleRestoreBackupPayload error:', err);
      showToast(`❌ Yedek geri yüklenirken hata oluştu: ${err.message || 'Bilinmeyen hata'}`);
    }
  };

  // 🌟 YEDEKTEN GERİ YÜKLE (JSON IMPORT - Türkçe Karakter Koruma & Onarma)
  const handleRestoreData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (event.target.files && event.target.files[0]) {
      fileReader.readAsText(event.target.files[0], 'UTF-8');
      fileReader.onload = (e) => {
        try {
          const rawText = e.target?.result as string;
          if (!rawText) return;
          // Otomatik mojibake onarımı ve Türkçe karakter temizliği
          const sanitizedText = fixTurkishMojibake(rawText);
          const rawParsed = JSON.parse(sanitizedText);
          const parsed = deepSanitizeTurkish(rawParsed);

          handleRestoreBackupPayload(parsed as BackupPayload);
        } catch (err) {
          console.error(err);
          showToast('Yedek dosyası okunurken hata oluştu.');
        }
      };
    }
    event.target.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Main Navigation Header */}
      <Header
        currentSection={currentSection}
        setCurrentSection={setCurrentSection}
        invoices={invoices}
        masterExcelRows={masterExcelRows}
        totalMizanItems={activeCompanyStockItems.length}
        activeInvoiceId={activeInvoiceId}
        setActiveInvoiceId={setActiveInvoiceId}
        onUploadClick={() => setIsUploadModalOpen(true)}
        onExportExcel={handleDirectMasterExcelExport}
        onCopyClipboard={handleCopyClipboard}
        onClearAll={handleClearAll}
        copySuccess={copySuccess}
        onBackupData={handleBackupData}
        onRestoreData={handleRestoreData}
      />

      {/* Main Section Content */}
      <main className="flex-1 w-full">
        {currentSection === 'fatura-tara' ? (
          /* 1. ANA BÖLÜM: FATURA TARA (3 Sütunlu Çalışma Alanı) */
          <div className="max-w-[1720px] mx-auto p-3 sm:p-4 lg:p-6">
            {invoices.length === 0 ? (
              <div className="max-w-4xl mx-auto py-12">
                <FileUploadArea
                  onInvoicesParsed={handleInvoicesParsed}
                  hasInvoices={false}
                  mizanCategories={mizanCategories}
                />
              </div>
            ) : (
              <div>
                {/* View Switcher Toolbar */}
                <div className="mb-3 flex items-center justify-between gap-3 bg-white p-2 sm:px-4 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">Çalışma Modu:</span>
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setIsSplitView(false)}
                        className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                          !isSplitView
                            ? 'bg-white text-indigo-700 shadow-xs font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>3 Sütunlu Görünüm</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsSplitView(true)}
                        className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSplitView
                            ? 'bg-indigo-600 text-white shadow-xs font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Bölünmüş Ekran (Split View - PDF & Editör)</span>
                      </button>
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500 font-medium">
                    <span>Toplam <strong>{invoices.length}</strong> fatura</span>
                    <span>•</span>
                    <span>Excel'de <strong>{masterExcelRows.length}</strong> kalem</span>
                  </div>
                </div>

                {!isSplitView ? (
                  /* STANDART 3 SÜTUNLU GÖRÜNÜM */
                  <div className="grid grid-cols-12 gap-4 items-start">
                    {/* 1. SOL PANEL: PDF Yükle ve Sıralı Fatura Listesi */}
                    <div className="col-span-12 lg:col-span-3 h-[calc(100vh-185px)] min-h-[500px]">
                      <InvoiceQueuePanel
                        invoices={invoices}
                        activeInvoiceId={activeInvoiceId}
                        onSelectInvoice={(id) => setActiveInvoiceId(id)}
                        onDeleteInvoice={handleDeleteInvoice}
                        onUploadClick={() => setIsUploadModalOpen(true)}
                        onTransferAllInvoicesToExcel={handleTransferAllInvoicesToExcel}
                      />
                    </div>

                    {/* 2. ORTA PANEL: Aktif Fatura Ürünlerini Düzenle & Sağdaki Excel'e Aktar */}
                    <div className="col-span-12 lg:col-span-4 xl:col-span-4 h-[calc(100vh-185px)] min-h-[500px]">
                      <InvoiceMiddleEditor
                        invoice={activeInvoice}
                        allInvoices={invoices}
                        invoiceIndex={activeInvoiceIndex >= 0 ? activeInvoiceIndex : 0}
                        totalInvoices={invoices.length}
                        onUpdateItem={handleUpdateItem}
                        onAddItem={handleAddItem}
                        onDeleteItem={handleDeleteItem}
                        onDeleteMultipleItems={handleDeleteMultipleItems}
                        onDuplicateItem={handleDuplicateItem}
                        onTransferItemsToExcel={handleTransferItemsToExcel}
                        onNextInvoice={handleNextInvoice}
                        onPrevInvoice={handlePrevInvoice}
                        mizanCategories={mizanCategories}
                        onSwitchToMizan={() => setCurrentSection('mizan')}
                        isSplitView={false}
                        onToggleSplitView={() => setIsSplitView(true)}
                        onAttachDocument={handleAttachDocument}
                      />
                    </div>

                    {/* 3. SAĞ PANEL: Excel Tablosu (A-F) & Mizana Stok Ekle / Düşür Butonları */}
                    <div className="col-span-12 lg:col-span-5 xl:col-span-5 h-[calc(100vh-185px)] min-h-[500px]">
                      <MasterExcelTable
                        rows={masterExcelRows}
                        onUpdateRow={handleUpdateMasterExcelRow}
                        onDeleteRow={handleDeleteMasterExcelRow}
                        onDeleteMultipleRows={handleDeleteMultipleMasterExcelRows}
                        onAddRow={handleAddMasterExcelRow}
                        onClearAllRows={handleClearAllMasterExcelRows}
                        onAddToMizan={handleAddToMizan}
                        onDeductFromMizan={handleDeductFromMizan}
                        mizanCategories={mizanCategories}
                      />
                    </div>
                  </div>
                ) : (
                  /* 📑 BÖLÜNMÜŞ EKRAN (SPLIT VIEW) GÖRÜNÜMÜ: SOL BELGE, SAĞ EDİTÖR + SEÇİLEBİLİR KUYRUK */
                  <div className="grid grid-cols-12 gap-4 items-start">
                    {/* SOL KUYRUK (Daraltılmış veya Hızlı Seçim) */}
                    <div className="col-span-12 lg:col-span-2 h-[calc(100vh-185px)] min-h-[500px]">
                      <InvoiceQueuePanel
                        invoices={invoices}
                        activeInvoiceId={activeInvoiceId}
                        onSelectInvoice={(id) => setActiveInvoiceId(id)}
                        onDeleteInvoice={handleDeleteInvoice}
                        onUploadClick={() => setIsUploadModalOpen(true)}
                        onTransferAllInvoicesToExcel={handleTransferAllInvoicesToExcel}
                      />
                    </div>

                    {/* SOL BELGE ÖNİZLEME (ORİJİNAL FATURA PDF / GÖRSEL) */}
                    <div className="col-span-12 lg:col-span-5 h-[calc(100vh-185px)] min-h-[500px]">
                      <InvoiceDocumentViewer
                        invoice={activeInvoice}
                        onAttachDocument={handleAttachDocument}
                      />
                    </div>

                    {/* SAĞ EDİTÖR (KALEMLER & EXCEL'E AKTARIM) */}
                    <div className="col-span-12 lg:col-span-5 h-[calc(100vh-185px)] min-h-[500px]">
                      <InvoiceMiddleEditor
                        invoice={activeInvoice}
                        allInvoices={invoices}
                        invoiceIndex={activeInvoiceIndex >= 0 ? activeInvoiceIndex : 0}
                        totalInvoices={invoices.length}
                        onUpdateItem={handleUpdateItem}
                        onAddItem={handleAddItem}
                        onDeleteItem={handleDeleteItem}
                        onDeleteMultipleItems={handleDeleteMultipleItems}
                        onDuplicateItem={handleDuplicateItem}
                        onTransferItemsToExcel={handleTransferItemsToExcel}
                        onNextInvoice={handleNextInvoice}
                        onPrevInvoice={handlePrevInvoice}
                        mizanCategories={mizanCategories}
                        onSwitchToMizan={() => setCurrentSection('mizan')}
                        isSplitView={true}
                        onToggleSplitView={() => setIsSplitView(false)}
                        onAttachDocument={handleAttachDocument}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* 2. ANA BÖLÜM: MİZAN (Şirket & Yıl Yönetimi, Kategorilere Göre Stoklar ve Hareketler) */
          <MizanView
            stockItems={activeCompanyStockItems}
            movements={activeCompanyMovements}
            allMizanStockItems={mizanStockItems}
            companies={companies}
            activeCompany={activeCompany}
            onSelectCompany={setActiveCompany}
            onAddCompany={handleAddCompany}
            onDeleteCompany={handleDeleteCompany}
            onRenameCompany={handleRenameCompany}
            years={years}
            activeYear={activeYear}
            onSelectYear={setActiveYear}
            onAddYear={handleAddYear}
            onTransferPreviousYearBalances={handleTransferPreviousYearBalances}
            onAddManualMovement={handleAddManualMovement}
            onClearMizan={handleClearMizan}
            onDeleteStockItem={handleDeleteMizanStockItem}
            onUpdateStockItem={handleUpdateMizanStockItem}
            onSwitchToScan={() => setCurrentSection('fatura-tara')}
            mizanCategories={mizanCategories}
            onAddCategory={handleAddMizanCategory}
            onEditCategory={handleEditMizanCategory}
            onDeleteCategory={handleDeleteMizanCategory}
            onAddToMizan={handleAddToMizan}
            onDeductFromMizan={handleDeductFromMizan}
            onIssueInvoice={handleIssueInvoiceFromMizan}
            onReconcileNegativeStock={handleReconcileNegativeStock}
          />
        )}
      </main>

      {/* Duplicate Invoices Detection Modal */}
      {pendingDuplicates && (
        <DuplicateInvoiceModal
          duplicates={pendingDuplicates}
          onConfirm={handleConfirmDuplicates}
          onCancel={() => {
            setPendingDuplicates(null);
            setPendingNonDuplicates([]);
          }}
        />
      )}

      {/* Upload Modal Dialog */}
      {isUploadModalOpen && (
        <FileUploadArea
          onInvoicesParsed={handleInvoicesParsed}
          hasInvoices={invoices.length > 0}
          isOpenModal={true}
          onCloseModal={() => setIsUploadModalOpen(false)}
          mizanCategories={mizanCategories}
        />
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-xl border border-slate-700 shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
