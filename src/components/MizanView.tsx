import React, { useState, useMemo } from 'react';
import {
  Layers,
  Search,
  Filter,
  Download,
  UploadCloud,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Package,
  TrendingUp,
  TrendingDown,
  Calendar,
  Tag,
  Trash2,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Boxes,
  PieChart,
  Edit3,
  Receipt,
  Building2,
  RefreshCw,
  Settings,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShieldAlert,
  AlertCircle,
  ArrowRight,
  ArrowRightLeft,
} from 'lucide-react';
import { MizanStockItem, MizanMovement, MasterExcelRow, ProcessedInvoice } from '../types';
import { formatCurrency, formatNumber, exportStockTemplateExcel } from '../lib/excelExport';
import { inferCategoryForProduct, findMizanStockMatch } from '../lib/categoryInferrer';
import { toTurkishLower, turkishEqual, turkishIncludes } from '../lib/turkishUtils';
import { MizanInvoiceModal } from './MizanInvoiceModal';
import * as XLSX from 'xlsx';

interface MizanViewProps {
  stockItems: MizanStockItem[];
  movements: MizanMovement[];
  allMizanStockItems?: MizanStockItem[];
  companies?: string[];
  activeCompany?: string;
  onSelectCompany?: (company: string) => void;
  onAddCompany?: (company: string) => void;
  onDeleteCompany?: (company: string) => void;
  onRenameCompany?: (oldName: string, newName: string) => void;
  years?: number[];
  activeYear?: number;
  onSelectYear?: (year: number) => void;
  onAddYear?: (year: number) => void;
  onTransferPreviousYearBalances?: () => void;
  onAddManualMovement: (movement: Omit<MizanMovement, 'id' | 'tarih' | 'toplamTutar'>) => void;
  onClearMizan: () => void;
  onDeleteStockItem: (id: string) => void;
  onUpdateStockItem?: (id: string, updatedFields: Partial<MizanStockItem>) => void;
  onSwitchToScan: () => void;
  mizanCategories?: string[];
  onAddCategory?: (categoryName: string) => void;
  onDeleteCategory?: (categoryName: string) => void;
  onEditCategory?: (oldName: string, newName: string) => void;
  onAddToMizan?: (rows: MasterExcelRow[]) => void;
  onDeductFromMizan?: (rows: MasterExcelRow[]) => void;
  onIssueInvoice?: (invoice: ProcessedInvoice, deductedRows: MasterExcelRow[]) => void;
  onReconcileNegativeStock?: (
    negativeItemId: string,
    targetStockItemId: string,
    quantityToDeduct: number,
    note?: string
  ) => void;
}

export const MizanView: React.FC<MizanViewProps> = ({
  stockItems,
  movements,
  allMizanStockItems = [],
  companies = ['Varsayılan Şirket'],
  activeCompany = 'Varsayılan Şirket',
  onSelectCompany,
  onAddCompany,
  onDeleteCompany,
  onRenameCompany,
  years = [2026],
  activeYear = 2026,
  onSelectYear,
  onAddYear,
  onTransferPreviousYearBalances,
  onAddManualMovement,
  onClearMizan,
  onDeleteStockItem,
  onUpdateStockItem,
  onSwitchToScan,
  mizanCategories = [],
  onAddCategory,
  onDeleteCategory,
  onEditCategory,
  onAddToMizan,
  onDeductFromMizan,
  onIssueInvoice,
  onReconcileNegativeStock,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'kategori' | 'tum-stok' | 'hareketler' | 'kategoriler' | 'eksi-stoklar'>('kategori');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isAddCatModalOpen, setIsAddCatModalOpen] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [catInputError, setCatInputError] = useState<string | null>(null);

  // Category Edit State
  const [editingCatOldName, setEditingCatOldName] = useState<string | null>(null);
  const [editingCatNewName, setEditingCatNewName] = useState<string>('');
  const [isEditCatModalOpen, setIsEditCatModalOpen] = useState(false);
  const [editCatModalOldName, setEditCatModalOldName] = useState<string | null>(null);
  const [editCatModalNewName, setEditCatModalNewName] = useState<string>('');
  const [editCatError, setEditCatError] = useState<string | null>(null);

  // Category Delete & Protection State
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<{
    name: string;
    products: MizanStockItem[];
  } | null>(null);

  // Company and Year Settings modal
  const [isCompanyYearSettingsModalOpen, setIsCompanyYearSettingsModalOpen] = useState(false);
  const [isAddCompanyModalOpen, setIsAddCompanyModalOpen] = useState(false);
  const [newCompanyInput, setNewCompanyInput] = useState('');
  const [editingCompanyOldName, setEditingCompanyOldName] = useState<string | null>(null);
  const [editingCompanyNewName, setEditingCompanyNewName] = useState<string>('');
  const [isAddYearModalOpen, setIsAddYearModalOpen] = useState(false);
  const [newYearInput, setNewYearInput] = useState<number>(2027);

  // Check if there are items from previous year to offer balance transfer
  const previousYear = activeYear - 1;
  const previousYearItemsCount = useMemo(() => {
    if (!allMizanStockItems) return 0;
    return allMizanStockItems.filter((st) => {
      const c = st.companyName || companies[0] || 'Varsayılan Şirket';
      const y = st.year || 2026;
      return c === activeCompany && y === previousYear && st.kalanMiktar > 0;
    }).length;
  }, [allMizanStockItems, activeCompany, previousYear, companies]);

  // Edit stock item state
  const [editingStockItem, setEditingStockItem] = useState<MizanStockItem | null>(null);
  const [editForm, setEditForm] = useState({
    urunAdi: '',
    kategori: mizanCategories[0] || '',
    birim: 'Adet',
    kalanMiktar: 0,
    ortalamaBirimFiyat: 0,
    kdvOrani: 20,
  });

  // Stok Düzeltme / Mahsup Modalı (Eksideki ürünü başka bir stoktan düşüp eksideki ürünü silme)
  const [reconcileNegativeItem, setReconcileNegativeItem] = useState<MizanStockItem | null>(null);
  const [reconcileTargetItemId, setReconcileTargetItemId] = useState<string>('');
  const [reconcileSearchTerm, setReconcileSearchTerm] = useState<string>('');
  const [reconcileSelectedCategory, setReconcileSelectedCategory] = useState<string>('all');
  const [reconcileDeductQuantity, setReconcileDeductQuantity] = useState<number>(1);
  const [reconcileNote, setReconcileNote] = useState<string>('');

  // Form state for manual adjustment
  const [manualForm, setManualForm] = useState({
    urunAdi: '',
    kategori: mizanCategories[0] || 'Genel Gider',
    birim: 'Adet',
    miktar: 1,
    birimFiyat: 0,
    kdvOrani: 20,
    islemTipi: 'giris' as 'giris' | 'cikis',
    faturaNo: 'Manuel Düzeltme',
  });

  // Clear Mizan multiplication confirmation modal state
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearMath, setClearMath] = useState({ num1: 7, num2: 8, expectedAnswer: 56 });
  const [clearUserInput, setClearUserInput] = useState('');
  const [clearError, setClearError] = useState<string | null>(null);

  // Pagination states for high performance with thousands of items
  const [allStockPageSize, setAllStockPageSize] = useState<number>(100);
  const [allStockCurrentPage, setAllStockCurrentPage] = useState<number>(1);

  const [catStockPageSize, setCatStockPageSize] = useState<number>(100);
  const [catStockCurrentPage, setCatStockCurrentPage] = useState<number>(1);

  const [movPageSize, setMovPageSize] = useState<number>(100);
  const [movCurrentPage, setMovCurrentPage] = useState<number>(1);

  // Negative stock items pagination & filter states
  const [negStockPageSize, setNegStockPageSize] = useState<number>(100);
  const [negStockCurrentPage, setNegStockCurrentPage] = useState<number>(1);
  const [negSelectedCategory, setNegSelectedCategory] = useState<string>('all');
  const [negSortBy, setNegSortBy] = useState<'quantity-asc' | 'quantity-desc' | 'value-asc' | 'name-asc' | 'date-desc'>('quantity-asc');

  // Aggregated totals (memoized for peak performance)
  const totalStockCount = stockItems.length;
  const totalQuantity = useMemo(() => stockItems.reduce((s, i) => s + i.kalanMiktar, 0), [stockItems]);
  const totalGiris = useMemo(() => stockItems.reduce((s, i) => s + i.toplamGiris, 0), [stockItems]);
  const totalCikis = useMemo(() => stockItems.reduce((s, i) => s + i.toplamCikis, 0), [stockItems]);
  const totalValue = useMemo(() => stockItems.reduce((s, i) => s + i.toplamDeger, 0), [stockItems]);
  const totalKdvValue = useMemo(() => {
    return stockItems.reduce((s, i) => {
      const kdvRate = i.kdvOrani !== undefined ? i.kdvOrani : 20;
      const kdvAmount = i.toplamKdvTutari !== undefined ? i.toplamKdvTutari : (i.toplamDeger * kdvRate) / 100;
      return s + kdvAmount;
    }, 0);
  }, [stockItems]);
  const totalGrossValue = useMemo(() => totalValue + totalKdvValue, [totalValue, totalKdvValue]);

  // KDV Breakdown Summary
  const kdvSummaryBreakdown = useMemo(() => {
    const map = new Map<number, { matrah: number; kdvTutari: number; count: number }>();
    stockItems.forEach((item) => {
      const rate = item.kdvOrani !== undefined ? item.kdvOrani : 20;
      const kdvAmount = item.toplamKdvTutari !== undefined ? item.toplamKdvTutari : (item.toplamDeger * rate) / 100;
      const existing = map.get(rate) || { matrah: 0, kdvTutari: 0, count: 0 };
      existing.matrah += item.toplamDeger;
      existing.kdvTutari += kdvAmount;
      existing.count += 1;
      map.set(rate, existing);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([rate, data]) => ({
        rate,
        matrah: data.matrah,
        kdvTutari: data.kdvTutari,
        toplamDahil: data.matrah + data.kdvTutari,
        count: data.count,
      }));
  }, [stockItems]);

  // Unique categories in stock
  const categoriesInStock = useMemo(() => {
    const map = new Map<string, { count: number; totalValue: number; totalKdv: number; items: MizanStockItem[] }>();
    stockItems.forEach((item) => {
      const cat = (item.kategori || 'Diğer').trim();
      const rate = item.kdvOrani !== undefined ? item.kdvOrani : 20;
      const itemKdv = item.toplamKdvTutari !== undefined ? item.toplamKdvTutari : (item.toplamDeger * rate) / 100;
      const existing = map.get(cat) || { count: 0, totalValue: 0, totalKdv: 0, items: [] };
      existing.count += 1;
      existing.totalValue += item.toplamDeger;
      existing.totalKdv += itemKdv;
      existing.items.push(item);
      map.set(cat, existing);
    });
    return Array.from(map.entries()).map(([kategori, data]) => ({
      kategori,
      count: data.count,
      totalValue: data.totalValue,
      totalKdv: data.totalKdv,
      totalGross: data.totalValue + data.totalKdv,
      items: data.items,
    }));
  }, [stockItems]);

  // Filtered items
  const filteredStockItems = useMemo(() => {
    return stockItems.filter((it) => {
      const matchSearch =
        searchTerm === '' ||
        turkishIncludes(it.urunAdi, searchTerm) ||
        turkishIncludes(it.kategori, searchTerm) ||
        `%${it.kdvOrani ?? 20}`.includes(searchTerm);
      const matchCat =
        selectedCategory === 'all' ||
        turkishEqual(it.kategori, selectedCategory);
      return matchSearch && matchCat;
    });
  }, [stockItems, searchTerm, selectedCategory]);

  // Paginated all stock
  const allStockTotalPages = useMemo(() => {
    if (allStockPageSize === -1) return 1;
    return Math.max(1, Math.ceil(filteredStockItems.length / allStockPageSize));
  }, [filteredStockItems.length, allStockPageSize]);

  const safeAllStockPage = Math.min(allStockCurrentPage, allStockTotalPages);

  const paginatedAllStockItems = useMemo(() => {
    if (allStockPageSize === -1) return filteredStockItems;
    const start = (safeAllStockPage - 1) * allStockPageSize;
    return filteredStockItems.slice(start, start + allStockPageSize);
  }, [filteredStockItems, safeAllStockPage, allStockPageSize]);

  // Paginated category detail stock
  const catStockTotalPages = useMemo(() => {
    if (catStockPageSize === -1) return 1;
    return Math.max(1, Math.ceil(filteredStockItems.length / catStockPageSize));
  }, [filteredStockItems.length, catStockPageSize]);

  const safeCatStockPage = Math.min(catStockCurrentPage, catStockTotalPages);

  const paginatedCatStockItems = useMemo(() => {
    if (catStockPageSize === -1) return filteredStockItems;
    const start = (safeCatStockPage - 1) * catStockPageSize;
    return filteredStockItems.slice(start, start + catStockPageSize);
  }, [filteredStockItems, safeCatStockPage, catStockPageSize]);

  // Filtered movements
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      return (
        searchTerm === '' ||
        turkishIncludes(m.urunAdi, searchTerm) ||
        turkishIncludes(m.kategori, searchTerm) ||
        (m.faturaNo && turkishIncludes(m.faturaNo, searchTerm)) ||
        `%${m.kdvOrani ?? 20}`.includes(searchTerm)
      );
    });
  }, [movements, searchTerm]);

  // Paginated movements
  const movTotalPages = useMemo(() => {
    if (movPageSize === -1) return 1;
    return Math.max(1, Math.ceil(filteredMovements.length / movPageSize));
  }, [filteredMovements.length, movPageSize]);

  const safeMovPage = Math.min(movCurrentPage, movTotalPages);

  const paginatedMovements = useMemo(() => {
    if (movPageSize === -1) return filteredMovements;
    const start = (safeMovPage - 1) * movPageSize;
    return filteredMovements.slice(start, start + movPageSize);
  }, [filteredMovements, safeMovPage, movPageSize]);

  // Negative stock items (miktarı eksiye düşmüş olan ürünler - tüm kategoriler)
  const negativeStockItems = useMemo(() => {
    return stockItems.filter((it) => it.kalanMiktar < 0);
  }, [stockItems]);

  const totalNegativeCount = negativeStockItems.length;

  const totalNegativeQuantity = useMemo(() => {
    return negativeStockItems.reduce((s, i) => s + i.kalanMiktar, 0);
  }, [negativeStockItems]);

  const totalNegativeValue = useMemo(() => {
    return negativeStockItems.reduce((s, i) => s + i.toplamDeger, 0);
  }, [negativeStockItems]);

  const totalNegativeKdvValue = useMemo(() => {
    return negativeStockItems.reduce((s, i) => {
      const rate = i.kdvOrani !== undefined ? i.kdvOrani : 20;
      const kdvAmount = i.toplamKdvTutari !== undefined ? i.toplamKdvTutari : (i.toplamDeger * rate) / 100;
      return s + kdvAmount;
    }, 0);
  }, [negativeStockItems]);

  const totalNegativeGrossValue = useMemo(() => {
    return totalNegativeValue + totalNegativeKdvValue;
  }, [totalNegativeValue, totalNegativeKdvValue]);

  // Affected categories for negative stock
  const affectedNegativeCategories = useMemo(() => {
    const map = new Map<string, { count: number; totalNegativeQty: number; totalDeficitVal: number }>();
    negativeStockItems.forEach((it) => {
      const cat = (it.kategori || 'Diğer').trim();
      const existing = map.get(cat) || { count: 0, totalNegativeQty: 0, totalDeficitVal: 0 };
      existing.count += 1;
      existing.totalNegativeQty += it.kalanMiktar;
      existing.totalDeficitVal += it.toplamDeger;
      map.set(cat, existing);
    });
    return Array.from(map.entries()).map(([kategori, data]) => ({
      kategori,
      count: data.count,
      totalNegativeQty: data.totalNegativeQty,
      totalDeficitVal: data.totalDeficitVal,
    })).sort((a, b) => b.count - a.count);
  }, [negativeStockItems]);

  // Filtered & sorted negative stock items
  const filteredNegativeStockItems = useMemo(() => {
    const list = negativeStockItems.filter((it) => {
      const matchSearch =
        searchTerm === '' ||
        turkishIncludes(it.urunAdi, searchTerm) ||
        turkishIncludes(it.kategori, searchTerm) ||
        `%${it.kdvOrani ?? 20}`.includes(searchTerm);
      const matchCat =
        negSelectedCategory === 'all' ||
        turkishEqual(it.kategori, negSelectedCategory);
      return matchSearch && matchCat;
    });

    return [...list].sort((a, b) => {
      if (negSortBy === 'quantity-asc') {
        return a.kalanMiktar - b.kalanMiktar; // En çok eksiye düşen (en derin açık) önce
      }
      if (negSortBy === 'quantity-desc') {
        return b.kalanMiktar - a.kalanMiktar; // Sıfıra en yakın olan önce
      }
      if (negSortBy === 'value-asc') {
        return a.toplamDeger - b.toplamDeger; // En yüksek tutar açığı önce
      }
      if (negSortBy === 'name-asc') {
        return a.urunAdi.localeCompare(b.urunAdi, 'tr');
      }
      if (negSortBy === 'date-desc') {
        return (b.sonIslemTarihi || '').localeCompare(a.sonIslemTarihi || '');
      }
      return 0;
    });
  }, [negativeStockItems, searchTerm, negSelectedCategory, negSortBy]);

  // Paginated negative stock
  const negStockTotalPages = useMemo(() => {
    if (negStockPageSize === -1) return 1;
    return Math.max(1, Math.ceil(filteredNegativeStockItems.length / negStockPageSize));
  }, [filteredNegativeStockItems.length, negStockPageSize]);

  const safeNegStockPage = Math.min(negStockCurrentPage, negStockTotalPages);

  const paginatedNegativeStockItems = useMemo(() => {
    if (negStockPageSize === -1) return filteredNegativeStockItems;
    const start = (safeNegStockPage - 1) * negStockPageSize;
    return filteredNegativeStockItems.slice(start, start + negStockPageSize);
  }, [filteredNegativeStockItems, safeNegStockPage, negStockPageSize]);

  // Quick Action: Pre-fill manual entry to compensate negative stock
  const handleQuickCompensate = (item: MizanStockItem) => {
    setManualForm({
      urunAdi: item.urunAdi,
      kategori: item.kategori,
      birim: item.birim,
      miktar: Math.abs(item.kalanMiktar),
      birimFiyat: item.ortalamaBirimFiyat > 0 ? item.ortalamaBirimFiyat : 0,
      kdvOrani: item.kdvOrani !== undefined ? item.kdvOrani : 20,
      islemTipi: 'giris',
      faturaNo: 'Eksi Bakiye Telafi Girişi',
    });
    setIsManualModalOpen(true);
  };

  // Quick Action: View movements for negative stock item
  const handleViewMovementsForProduct = (productName: string) => {
    setSearchTerm(productName);
    setActiveSubTab('hareketler');
  };

  // Export negative stock items to Excel
  const handleExportNegativeStockExcel = () => {
    if (negativeStockItems.length === 0) return;

    const rows = negativeStockItems.map((item, idx) => {
      const kdvRate = item.kdvOrani !== undefined ? item.kdvOrani : 20;
      const kdvTutari = item.toplamKdvTutari !== undefined ? item.toplamKdvTutari : (item.toplamDeger * kdvRate) / 100;
      const brutDeger = item.toplamKdvDahilDeger !== undefined ? item.toplamKdvDahilDeger : item.toplamDeger + kdvTutari;

      return {
        'Sıra No': idx + 1,
        'Kategori': item.kategori,
        'Ürün / Hizmet Adı': item.urunAdi,
        'Birim': item.birim,
        'Toplam Giriş': item.toplamGiris,
        'Toplam Çıkış': item.toplamCikis,
        'Eksi Stok Bakiyesi': item.kalanMiktar,
        'Gerekli Telafi Miktarı (+Giriş)': Math.abs(item.kalanMiktar),
        'Ortalama Birim Fiyat (KDV Hariç ₺)': item.ortalamaBirimFiyat,
        'KDV Oranı (%)': kdvRate,
        'Maliyet Açığı (KDV Hariç ₺)': item.toplamDeger,
        'Hesaplanan KDV Açığı (₺)': kdvTutari,
        'Genel Açık Tutarı (KDV Dahil ₺)': brutDeger,
        'Son İşlem Tarihi': item.sonIslemTarihi || '-',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Eksiye_Dusen_Stoklar');

    const fileName = `Mizan_Eksi_Stok_Raporu_${activeCompany.replace(/[^a-zA-Z0-9]/g, '_')}_${activeYear}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Export Mizan to Excel
  const handleExportMizanExcel = () => {
    if (stockItems.length === 0) {
      return;
    }

    const rows = stockItems.map((item, idx) => {
      const kdvRate = item.kdvOrani !== undefined ? item.kdvOrani : 20;
      const kdvTutari = item.toplamKdvTutari !== undefined ? item.toplamKdvTutari : (item.toplamDeger * kdvRate) / 100;
      const brutDeger = item.toplamKdvDahilDeger !== undefined ? item.toplamKdvDahilDeger : item.toplamDeger + kdvTutari;

      return {
        'Sıra No': idx + 1,
        'Kategori': item.kategori,
        'Ürün / Hizmet Adı': item.urunAdi,
        'Birim': item.birim,
        'Toplam Giriş': item.toplamGiris,
        'Toplam Çıkış': item.toplamCikis,
        'Kalan Stok (Bakiye)': item.kalanMiktar,
        'Ortalama Birim Fiyat (KDV Hariç ₺)': item.ortalamaBirimFiyat,
        'KDV Oranı (%)': kdvRate,
        'Net Stok Değeri (KDV Hariç ₺)': item.toplamDeger,
        'Hesaplanan KDV Tutarı (₺)': kdvTutari,
        'Genel Stok Değeri (KDV Dahil ₺)': brutDeger,
        'Son İşlem Tarihi': item.sonIslemTarihi || '-',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mizan_Stok_Ozeti');

    // Also append movements sheet
    if (movements.length > 0) {
      const movRows = movements.map((m, idx) => {
        const kdvRate = m.kdvOrani !== undefined ? m.kdvOrani : 20;
        const matrah = m.miktar * m.birimFiyat;

        return {
          'İşlem No': idx + 1,
          'Tarih': m.tarih,
          'İşlem Tipi': m.islemTipi === 'giris' ? 'Giriş (Stok Ekle)' : 'Çıkış (Stok Düşür)',
          'Fatura / Belge No': m.faturaNo || '-',
          'Kategori': m.kategori,
          'Ürün Adı': m.urunAdi,
          'Miktar': m.miktar,
          'Birim': m.birim,
          'Birim Fiyat (₺)': m.birimFiyat,
          'KDV Oranı (%)': kdvRate,
          'Toplam Tutar (₺)': matrah,
        };
      });
      const movSheet = XLSX.utils.json_to_sheet(movRows);
      XLSX.utils.book_append_sheet(workbook, movSheet, 'Stok_Hareketleri');
    }

    const fileName = `Mizan_Stok_Raporu_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const handleAddNewCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatInput.trim();
    if (!trimmed) {
      setCatInputError('Kategori adı boş bırakılamaz.');
      return;
    }
    if (mizanCategories.some((c) => turkishEqual(c, trimmed))) {
      setCatInputError('Bu kategori adı zaten mevcut.');
      return;
    }
    if (onAddCategory) {
      onAddCategory(trimmed);
    }
    setNewCatInput('');
    setCatInputError(null);
    setIsAddCatModalOpen(false);
  };

  const handleOpenEditCategoryModal = (catName: string) => {
    setEditCatModalOldName(catName);
    setEditCatModalNewName(catName);
    setEditCatError(null);
    setIsEditCatModalOpen(true);
  };

  const handleSaveEditCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCatModalOldName) return;
    const trimmed = editCatModalNewName.trim();
    if (!trimmed) {
      setEditCatError('Kategori adı boş bırakılamaz.');
      return;
    }
    if (
      trimmed !== editCatModalOldName &&
      mizanCategories.some((c) => c !== editCatModalOldName && turkishEqual(c, trimmed))
    ) {
      setEditCatError(`"${trimmed}" adında başka bir kategori zaten mevcut.`);
      return;
    }
    if (onEditCategory) {
      onEditCategory(editCatModalOldName, trimmed);
    }
    if (selectedCategory === editCatModalOldName) {
      setSelectedCategory(trimmed);
    }
    setIsEditCatModalOpen(false);
    setEditCatModalOldName(null);
    setEditCatModalNewName('');
    setEditCatError(null);
  };

  const handleInitiateDeleteCategory = (catName: string) => {
    if (mizanCategories.length <= 1) {
      alert('En az bir kategori tanımlı kalmalıdır.');
      return;
    }
    const source = allMizanStockItems && allMizanStockItems.length > 0 ? allMizanStockItems : stockItems;
    const relatedProducts = source.filter((item) => turkishEqual(item.kategori, catName));
    setCategoryDeleteTarget({
      name: catName,
      products: relatedProducts,
    });
  };

  const handleConfirmDeleteCategory = () => {
    if (!categoryDeleteTarget) return;
    if (categoryDeleteTarget.products.length > 0) return; // Kategori içerisinde ürün varsa silmeye izin verme
    if (onDeleteCategory) {
      onDeleteCategory(categoryDeleteTarget.name);
    }
    if (selectedCategory === categoryDeleteTarget.name) {
      setSelectedCategory('all');
    }
    setCategoryDeleteTarget(null);
  };

  const handleOpenReconcileModal = (item: MizanStockItem) => {
    const deficit = Math.abs(item.kalanMiktar);
    setReconcileNegativeItem(item);
    setReconcileTargetItemId('');
    setReconcileSearchTerm('');
    setReconcileSelectedCategory('all');
    setReconcileDeductQuantity(deficit > 0 ? deficit : 1);
    setReconcileNote(`Stok Düzeltme (${item.urunAdi} Mahsubu)`);
  };

  const handleConfirmReconcile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileNegativeItem || !reconcileTargetItemId) {
      alert('Lütfen eksi bakiyenin düşüleceği hedef stoğu seçiniz.');
      return;
    }
    const targetItem = stockItems.find((s) => s.id === reconcileTargetItemId);
    if (!targetItem) {
      alert('Seçilen hedef stok bulunamadı.');
      return;
    }
    const qty = Number(reconcileDeductQuantity);
    if (isNaN(qty) || qty <= 0) {
      alert('Lütfen geçerli bir düşülecek miktar giriniz.');
      return;
    }

    if (onReconcileNegativeStock) {
      onReconcileNegativeStock(
        reconcileNegativeItem.id,
        reconcileTargetItemId,
        qty,
        reconcileNote.trim() || undefined
      );
    } else {
      // Fallback if prop is somehow not provided: add manual negative movement to target & delete negative item
      onAddManualMovement({
        urunAdi: targetItem.urunAdi,
        kategori: targetItem.kategori,
        birim: targetItem.birim,
        miktar: qty,
        birimFiyat: targetItem.ortalamaBirimFiyat,
        kdvOrani: targetItem.kdvOrani ?? 20,
        islemTipi: 'cikis',
        faturaNo: reconcileNote.trim() || `Stok Düzeltme (${reconcileNegativeItem.urunAdi} Mahsubu)`,
      });
      onDeleteStockItem(reconcileNegativeItem.id);
    }

    setReconcileNegativeItem(null);
    setReconcileTargetItemId('');
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.urunAdi.trim()) return;

    onAddManualMovement({
      urunAdi: manualForm.urunAdi.trim(),
      kategori: manualForm.kategori,
      birim: manualForm.birim,
      miktar: Number(manualForm.miktar) || 1,
      birimFiyat: Number(manualForm.birimFiyat) || 0,
      kdvOrani: Number(manualForm.kdvOrani) !== undefined ? Number(manualForm.kdvOrani) : 20,
      islemTipi: manualForm.islemTipi,
      faturaNo: manualForm.faturaNo,
    });

    setIsManualModalOpen(false);
    setManualForm({
      urunAdi: '',
      kategori: mizanCategories[0] || 'Genel Gider',
      birim: 'Adet',
      miktar: 1,
      birimFiyat: 0,
      kdvOrani: 20,
      islemTipi: 'giris',
      faturaNo: 'Manuel Düzeltme',
    });
  };

  const handleImportStockExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws);

        if (!data || data.length === 0) {
          alert('Excel dosyasında veri bulunamadı.');
          return;
        }

        const rowsToAdd: MasterExcelRow[] = [];
        const rowsToDeduct: MasterExcelRow[] = [];

        const parseExcelNum = (val: any, defaultVal: number): number => {
          if (val === undefined || val === null || val === '') return defaultVal;
          if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
          const str = String(val).trim().replace(',', '.').replace('%', '');
          const num = parseFloat(str);
          return isNaN(num) ? defaultVal : num;
        };

        data.forEach((row, idx) => {
          let kategoriStr = row['Kategori'] || row['kategori'] || row['KATEGORİ'];
          const urunAdi = row['Ürün Adı'] || row['urunAdi'] || row['Ürün/Hizmet Adı'] || `Ürün ${idx + 1}`;

          // Check if product exists in Mizan stock
          const mizanMatch = findMizanStockMatch(String(urunAdi), stockItems);
          if (mizanMatch && mizanMatch.kategori) {
            kategoriStr = mizanMatch.kategori;
          } else if (!kategoriStr || String(kategoriStr).trim() === '' || String(kategoriStr).trim() === 'Diğer' || String(kategoriStr).trim() === 'Genel Gider') {
            kategoriStr = inferCategoryForProduct(String(urunAdi), mizanCategories, stockItems);
          }

          const miktar = parseExcelNum(
            row['Miktar'] ?? row['miktar'] ?? row['MİKTAR'] ?? row['Miktar (B)'],
            1
          );
          const birim = row['Birim'] || row['birim'] || 'Adet';
          const fiyat = parseExcelNum(
            row['Fiyat'] ?? row['fiyat'] ?? row['FİYAT'] ?? row['Birim Fiyat'] ?? row['Fiyat (D)'] ?? row['Ortalama Fiyat (₺)'] ?? row['Ortalama Fiyat (KDV Hariç ₺)'],
            0
          );
          const kdvOrani = parseExcelNum(
            row['KDV Oranı (%)'] ?? row['KDV Oranı'] ?? row['kdvOrani'] ?? row['KDV %'] ?? row['KDV'] ?? row['Kdv'] ?? row['KDV Orani (%)'] ?? row['KDV Orani'],
            20
          );
          const islemTipiStr = String(row['İşlem Tipi (Giriş/Çıkış)'] || row['islemTipi'] || row['İşlem Tipi'] || 'Giriş').toLowerCase();

          if (onAddCategory && !mizanCategories.some((c) => c.toLowerCase() === String(kategoriStr).toLowerCase())) {
            onAddCategory(String(kategoriStr));
          }

          const masterRow: MasterExcelRow = {
            id: `import-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            urunAdi: String(urunAdi),
            miktar,
            birim: String(birim),
            fiyat,
            kdvOrani,
            kategori: String(kategoriStr),
            sourceInvoiceNo: 'Excel Toplu Yükleme',
          };

          if (islemTipiStr.includes('çıkış') || islemTipiStr.includes('cikis') || islemTipiStr.includes('çikis')) {
            rowsToDeduct.push(masterRow);
          } else {
            rowsToAdd.push(masterRow);
          }
        });

        if (rowsToAdd.length > 0 && onAddToMizan) {
          onAddToMizan(rowsToAdd);
        }
        if (rowsToDeduct.length > 0 && onDeductFromMizan) {
          onDeductFromMizan(rowsToDeduct);
        }

        alert(`✅ Excel'den ${data.length} kalem ürün başarıyla Mizana aktarıldı!`);
      } catch (err) {
        console.error(err);
        alert('Excel dosyası okunurken hata oluştu. Lütfen taslak formata uygun olduğundan emin olun.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-[1720px] w-full mx-auto p-3 sm:p-4 lg:p-6 space-y-4">
      {/* 🏢 MİZAN AYARLAR VE BİLGİ BARI */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Active Company & Year Badge */}
          <div className="flex items-center gap-2 bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs">
            <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="truncate max-w-[200px]">{activeCompany}</span>
            <span className="w-1 h-1 rounded-full bg-slate-500"></span>
            <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-emerald-300 font-mono font-bold">{activeYear} Mali Yılı</span>
          </div>

          {/* ⚙️ AYARLAR BUTONU */}
          <button
            type="button"
            id="btn-mizan-settings"
            onClick={() => setIsCompanyYearSettingsModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 text-indigo-800 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs group"
            title="Şirket Seçimi, Mali Yıl Geçişleri ve Devir Ayarları"
          >
            <Settings className="w-4 h-4 text-indigo-600 group-hover:rotate-45 transition-transform" />
            <span>Ayarlar (Şirket & Yıl Seçimi)</span>
          </button>
        </div>

        {/* Right Side: Status Badge */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-slate-200/80 text-slate-700 rounded-xl text-[11px] font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Aktif Mizan: <strong>{activeCompany}</strong> ({activeYear})</span>
          </div>
        </div>
      </div>

      {/* Mizan Top Summary Banner */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-950 rounded-2xl p-5 sm:p-6 text-white shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-500/30">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
              Mizan Toplam Stok Değeri
            </span>
          </div>

          <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight text-white pt-1">
            {formatCurrency(totalValue)}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10 w-full lg:w-auto shrink-0">
          <div className="text-center px-2">
            <div className="text-xs text-indigo-200 font-medium">Kayıtlı Ürün</div>
            <div className="text-base font-bold font-mono text-white">{totalStockCount} Çeşit</div>
          </div>
          <div className="w-px h-7 bg-white/20 hidden sm:block"></div>
          <div className="text-center px-2">
            <div className="text-xs text-indigo-200 font-medium">Toplam Miktar</div>
            <div className="text-base font-bold font-mono text-white">{formatNumber(totalQuantity, 0)}</div>
          </div>
          <div className="w-px h-7 bg-white/20 hidden sm:block"></div>
          <div className="text-center px-2">
            <div className="text-xs text-indigo-200 font-medium">Kategori</div>
            <div className="text-base font-bold font-mono text-white">{categoriesInStock.length} Tür</div>
          </div>
          <div className="w-px h-7 bg-white/20 hidden sm:block"></div>
          <div className="text-center px-2">
            <div className="text-xs text-indigo-200 font-medium">Aktif Yıl</div>
            <div className="text-base font-bold font-mono text-emerald-300">{activeYear} Mizanı</div>
          </div>
          <div className="w-px h-7 bg-white/20 hidden sm:block"></div>
          <button
            type="button"
            onClick={() => setActiveSubTab('eksi-stoklar')}
            className={`text-center px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
              totalNegativeCount > 0
                ? 'bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/50 shadow-inner'
                : 'hover:bg-white/10'
            }`}
            title="Miktarı eksiye düşen ürünleri göster"
          >
            <div className={`text-xs font-semibold flex items-center justify-center gap-1 ${totalNegativeCount > 0 ? 'text-rose-200' : 'text-indigo-200'}`}>
              {totalNegativeCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping"></span>}
              <span>Eksi Bakiye</span>
            </div>
            <div className={`text-base font-bold font-mono ${totalNegativeCount > 0 ? 'text-rose-300 font-black' : 'text-white'}`}>
              {totalNegativeCount > 0 ? `${totalNegativeCount} Ürün (!)` : '0 Ürün'}
            </div>
          </button>
        </div>
      </div>

      {/* Eksiye Düşen Stoklar Hızlı Uyarı Bannerı */}
      {totalNegativeCount > 0 && activeSubTab !== 'eksi-stoklar' && (
        <div className="bg-gradient-to-r from-rose-50 via-red-50/80 to-amber-50/50 border-2 border-rose-200 rounded-2xl p-4 sm:p-4.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs animate-in fade-in">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-rose-950 text-sm">
                  Kritik Stok Uyarısı: {totalNegativeCount} Ürünün Miktarı Eksiye Düşmüş Durumda!
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-200 text-rose-900 font-mono">
                  Net Açık: {formatNumber(Math.abs(totalNegativeQuantity), 2)} Birim
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 font-mono">
                  {affectedNegativeCategories.length} Kategori Etkilendi
                </span>
              </div>
              <p className="text-xs text-rose-800 mt-1 max-w-3xl leading-relaxed">
                Mizanınızda çıkış miktarı giriş miktarından fazla olan ürünler tespit edildi. Genellikle mal alışı girilmeden satış faturası kesildiğinde oluşur.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveSubTab('eksi-stoklar')}
              className="w-full sm:w-auto px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-sm"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Eksiye Düşen Ürünleri İncele ({totalNegativeCount})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Navigation Toolbar & Sub-Tabs */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          {/* Sub Tab Switcher */}
          <div className="flex items-center bg-white p-1 rounded-lg border border-slate-200 shadow-2xs flex-wrap gap-1">
            <button
              onClick={() => setActiveSubTab('kategori')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'kategori'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kategori Bazlı Mizan ({categoriesInStock.length})
            </button>
            <button
              onClick={() => setActiveSubTab('tum-stok')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'tum-stok'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tüm Stok Listesi ({stockItems.length})
            </button>
            <button
              onClick={() => setActiveSubTab('hareketler')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'hareketler'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Giriş / Çıkış Hareketleri ({movements.length})
            </button>
            <button
              onClick={() => setActiveSubTab('kategoriler')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'kategoriler'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Mizan Kategorileri ({mizanCategories.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('eksi-stoklar')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'eksi-stoklar'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : totalNegativeCount > 0
                  ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${activeSubTab === 'eksi-stoklar' ? 'text-white' : totalNegativeCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
              <span>Eksiye Düşenler</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  activeSubTab === 'eksi-stoklar'
                    ? 'bg-white/20 text-white'
                    : totalNegativeCount > 0
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {totalNegativeCount}
              </span>
            </button>
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Mizanda ürün veya kategori ara..."
                className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48 sm:w-64"
              />
            </div>

            <button
              onClick={() => {
                setCatInputError(null);
                setNewCatInput('');
                setIsAddCatModalOpen(true);
              }}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Mizana yeni bir kategori ekle (Fatura okuma ve Excel tablolarında geçerli olur)"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              <span>+ Kategori Ekle</span>
            </button>

            <button
              onClick={() => setIsManualModalOpen(true)}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              <span>Manuel Stok İşlemi</span>
            </button>

            <button
              onClick={() => setIsInvoiceModalOpen(true)}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Mizandaki mevcut stoklardan satış faturası kes ve stoktan düş"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Fatura Kes (Satış)</span>
            </button>

            <button
              onClick={handleExportMizanExcel}
              disabled={stockItems.length === 0}
              className="px-3.5 py-1.5 bg-[#107c41] hover:bg-[#0b5a2f] text-white font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-40 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Mizan Excel İndir (.xlsx)</span>
            </button>

            <button
              onClick={exportStockTemplateExcel}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Stok eklemek için örnek Excel taslağını indir"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Taslak Excel İndir</span>
            </button>

            <label
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Doldurduğunuz Excel dosyasını seçerek stokları Mizana aktarın"
            >
              <UploadCloud className="w-3.5 h-3.5 text-emerald-700" />
              <span>Excelden Stok Yükle</span>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleImportStockExcel}
                className="hidden"
              />
            </label>

            {stockItems.length > 0 && (
              <button
                onClick={() => {
                  const n1 = Math.floor(Math.random() * 6) + 4; // 4 ile 9 arası
                  const n2 = Math.floor(Math.random() * 6) + 4; // 4 ile 9 arası
                  setClearMath({ num1: n1, num2: n2, expectedAnswer: n1 * n2 });
                  setClearUserInput('');
                  setClearError(null);
                  setIsClearModalOpen(true);
                }}
                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Tüm mizanı temizle (Çarpım tablosu doğrulaması ile)"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Category Filter Pills (when on stock views) */}
        {activeSubTab !== 'hareketler' && activeSubTab !== 'kategoriler' && activeSubTab !== 'eksi-stoklar' && (
          <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider whitespace-nowrap mr-1">
              Kategori Filtresi:
            </span>
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Tümü ({stockItems.length})
            </button>
            {mizanCategories.map((catName) => {
              const inStockData = categoriesInStock.find(
                (c) => turkishEqual(c.kategori, catName)
              );
              const count = inStockData ? inStockData.count : 0;
              return (
                <button
                  key={catName}
                  onClick={() => setSelectedCategory(catName)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedCategory === catName
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{catName}</span>
                  <span className="text-[10px] opacity-75 font-mono">({count})</span>
                </button>
              );
            })}
            <button
              onClick={() => {
                setCatInputError(null);
                setNewCatInput('');
                setIsAddCatModalOpen(true);
              }}
              className="px-2 py-1 rounded-md text-xs font-bold text-indigo-600 hover:bg-indigo-50 border border-dashed border-indigo-300 whitespace-nowrap cursor-pointer transition-colors ml-1"
            >
              + Yeni Kategori
            </button>
          </div>
        )}

        {/* View 1: Categorized Bento Group View / Category Buttons Homepage */}
        {activeSubTab === 'kategori' && (
          <div className="p-4 sm:p-6 space-y-6">
            {selectedCategory === 'all' ? (
              /* MİZAN ANASAYFASI: KATEGORİ BUTONLARI */
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <Tag className="w-4 h-4 text-indigo-600" />
                      <span>Mizan Kategorileri</span>
                      <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-full font-mono font-bold">
                        {mizanCategories.length} Kategori
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      İçindeki ürünleri listelemek ve stok hareketlerini görmek için bir kategori butonuna tıklayın.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCatInputError(null);
                        setNewCatInput('');
                        setIsAddCatModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Yeni Kategori Ekle</span>
                    </button>
                  </div>
                </div>

                {/* Interactive Category Buttons Bento Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {mizanCategories.map((catName) => {
                    const inStockData = categoriesInStock.find(
                      (c) => turkishEqual(c.kategori, catName)
                    );
                    const productCount = inStockData ? inStockData.count : 0;
                    const totalVal = inStockData ? inStockData.totalValue : 0;
                    const totalQty = inStockData
                      ? inStockData.items.reduce((s, i) => s + i.kalanMiktar, 0)
                      : 0;
                    const negCountInCat = inStockData
                      ? inStockData.items.filter((i) => i.kalanMiktar < 0).length
                      : 0;

                    return (
                      <div
                        key={catName}
                        onClick={() => setSelectedCategory(catName)}
                        className={`bg-white border-2 rounded-xl p-4 transition-all duration-150 shadow-2xs hover:shadow-md cursor-pointer flex flex-col justify-between group hover:-translate-y-0.5 relative overflow-hidden ${
                          negCountInCat > 0 ? 'border-rose-200 hover:border-rose-400' : 'border-slate-200 hover:border-indigo-500'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold transition-colors shrink-0 ${
                              negCountInCat > 0
                                ? 'bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white'
                                : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'
                            }`}>
                              <Tag className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors line-clamp-1">
                                {catName}
                              </h4>
                              <span className="text-[10px] text-slate-400">
                                Mizan Kategorisi
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {negCountInCat > 0 && (
                              <span
                                className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse"
                                title={`Bu kategoride ${negCountInCat} ürün eksi bakiyede`}
                              >
                                ⚠️ {negCountInCat} Eksi
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                productCount > 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {productCount > 0 ? `${productCount} Ürün` : 'Boş'}
                            </span>
                            {onEditCategory && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditCategoryModal(catName);
                                }}
                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                                title={`"${catName}" kategorisini düzenle`}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onDeleteCategory && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleInitiateDeleteCategory(catName);
                                }}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                                title={
                                  productCount > 0
                                    ? `"${catName}" kategorisinde ${productCount} ürün mevcut (Silinemez - Detayı Gör)`
                                    : `"${catName}" kategorisini sil`
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Category Stats */}
                        <div className="bg-slate-50 rounded-lg p-2.5 space-y-1 text-xs mb-3 group-hover:bg-indigo-50/40 transition-colors">
                          <div className="flex justify-between items-center text-slate-600 text-[11px]">
                            <span>Toplam Stok:</span>
                            <span className="font-bold text-slate-800 font-mono">
                              {formatNumber(totalQty, 1)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-slate-600 text-[11px] pt-1 border-t border-slate-200/70">
                            <span className="font-medium">Stok Değeri:</span>
                            <span className="font-bold text-indigo-700 font-mono">
                              {formatCurrency(totalVal)}
                            </span>
                          </div>
                        </div>

                        {/* Button Action */}
                        <div className="w-full py-2 px-3 bg-slate-100 group-hover:bg-indigo-600 text-slate-700 group-hover:text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-between">
                          <span>Ürünlere Gir ({productCount})</span>
                          <ArrowUpRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </div>
                      </div>
                    );
                  })}

                  {/* Add New Category Action Button Card */}
                  <div
                    onClick={() => {
                      setCatInputError(null);
                      setNewCatInput('');
                      setIsAddCatModalOpen(true);
                    }}
                    className="border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30 rounded-xl p-4 flex flex-col items-center justify-center text-center gap-2 cursor-pointer transition-all min-h-[160px] group"
                  >
                    <div className="w-10 h-10 rounded-full bg-white border border-slate-200 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center transition-colors shadow-2xs">
                      <Plus className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-xs text-slate-700 group-hover:text-indigo-700">
                      + Yeni Kategori Ekle
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Mizana yeni hesap grubu tanımlayın
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* KATEGORİ DETAY SAYFASI: SEÇİLEN KATEGORİNİN ÜRÜNLERİ */
              <div className="space-y-4">
                {/* Back to All Categories Banner & Category Header */}
                <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('all')}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-indigo-200 text-indigo-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <span>← Tüm Kategorilere Dön</span>
                    </button>

                    <div className="h-6 w-px bg-indigo-200 hidden sm:block"></div>

                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                        <Tag className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">
                          {selectedCategory}
                        </h3>
                        <p className="text-[11px] text-indigo-700 font-medium">
                          {filteredStockItems.length} Kalem Ürün • Toplam Değer:{' '}
                          <strong className="font-mono font-bold">
                            {formatCurrency(
                              filteredStockItems.reduce((s, i) => s + i.toplamDeger, 0)
                            )}
                          </strong>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {onDeleteCategory && (
                      <button
                        type="button"
                        onClick={() => handleInitiateDeleteCategory(selectedCategory)}
                        className={`px-3 py-1.5 border font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                          filteredStockItems.length > 0
                            ? 'bg-slate-50 border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50'
                            : 'bg-white border-red-200 text-red-600 hover:bg-red-50'
                        }`}
                        title={
                          filteredStockItems.length > 0
                            ? `"${selectedCategory}" kategorisinde ${filteredStockItems.length} ürün mevcut (Silinemez)`
                            : `"${selectedCategory}" kategorisini sil`
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Kategoriyi Sil</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setManualForm({
                          ...manualForm,
                          kategori: selectedCategory,
                        });
                        setIsManualModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Bu Kategoriye Manuel Stok Ekle</span>
                    </button>
                  </div>
                </div>

                {/* Category Items Table */}
                {filteredStockItems.length === 0 ? (
                  <div className="py-14 text-center bg-white border border-slate-200 rounded-xl p-6">
                    <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                      <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Package className="w-6 h-6" />
                      </div>
                      <h4 className="font-bold text-slate-800 text-sm">
                        "{selectedCategory}" Kategorisinde Henüz Ürün Yok
                      </h4>
                      <p className="text-xs text-slate-500">
                        "Fatura Tara" ekranından okunan fatura kalemlerini bu kategoriye aktarabilir veya hemen manuel stok ekleyebilirsiniz.
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setManualForm({
                              ...manualForm,
                              kategori: selectedCategory,
                            });
                            setIsManualModalOpen(true);
                          }}
                          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
                        >
                          + Manuel Stok Girişi Yap
                        </button>
                        <button
                          type="button"
                          onClick={onSwitchToScan}
                          className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                        >
                          Fatura Tara'ya Git ➔
                        </button>
                        {onDeleteCategory && (
                          <button
                            type="button"
                            onClick={() => handleInitiateDeleteCategory(selectedCategory)}
                            className="px-3.5 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                            title="Bu boş kategoriyi sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Bu Boş Kategoriyi Sil</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2.5 min-w-[200px]">Ürün / Hizmet Adı</th>
                            <th className="w-36 px-2 py-2.5 text-indigo-900 font-bold">Kategori (Değiştir)</th>
                            <th className="w-20 px-2 py-2.5 text-center">Birim</th>
                            <th className="w-24 px-2 py-2.5 text-center text-emerald-700">Toplam Giriş</th>
                            <th className="w-24 px-2 py-2.5 text-center text-amber-700">Toplam Çıkış</th>
                            <th className="w-28 px-2 py-2.5 text-center font-bold text-indigo-900 bg-indigo-50/50">
                              Kalan Stok
                            </th>
                            <th className="w-24 px-2 py-2.5 text-right">Ort. Fiyat</th>
                            <th className="w-20 px-2 py-2.5 text-center text-indigo-700 font-bold">KDV %</th>
                            <th className="w-28 px-3 py-2.5 text-right font-bold text-slate-900">Toplam Değer (₺)</th>
                            <th className="w-24 px-2 py-2.5 text-center text-slate-400">Son İşlem</th>
                            <th className="w-16 px-2 py-2.5 text-center text-slate-600 font-bold">İşlem</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {paginatedCatStockItems.map((item, idx) => {
                            const globalIdx = (safeCatStockPage - 1) * (catStockPageSize === -1 ? 0 : catStockPageSize) + idx;
                            const kdvRate = item.kdvOrani !== undefined ? item.kdvOrani : 20;

                            return (
                              <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-3 py-2.5 font-medium text-slate-800">
                                  <span className="font-mono text-slate-400 text-[11px] mr-2">#{globalIdx + 1}</span>
                                  {item.urunAdi}
                                </td>
                                <td className="px-2 py-2.5">
                                  <select
                                    value={item.kategori}
                                    onChange={(e) => {
                                      const newCat = e.target.value;
                                      if (onUpdateStockItem) {
                                        onUpdateStockItem(item.id, { kategori: newCat });
                                      }
                                    }}
                                    className="bg-indigo-50/70 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 font-semibold text-xs rounded-md px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer transition-colors max-w-[150px] truncate"
                                    title="Ürünün kategorisini değiştirmek için seçin"
                                  >
                                    {mizanCategories.map((cat) => (
                                      <option key={cat} value={cat}>
                                        {cat}
                                      </option>
                                    ))}
                                    {!mizanCategories.includes(item.kategori) && (
                                      <option value={item.kategori}>{item.kategori}</option>
                                    )}
                                  </select>
                                </td>
                                <td className="px-2 py-2.5 text-center text-slate-500 italic">
                                  {item.birim}
                                </td>
                                <td className="px-2 py-2.5 text-center font-mono font-semibold text-emerald-700">
                                  +{formatNumber(item.toplamGiris, 2)}
                                </td>
                                <td className="px-2 py-2.5 text-center font-mono font-semibold text-amber-700">
                                  -{formatNumber(item.toplamCikis, 2)}
                                </td>
                                <td className="px-2 py-2.5 text-center font-mono font-bold bg-indigo-50/30">
                                  <span
                                    className={`px-2 py-0.5 rounded text-xs ${
                                      item.kalanMiktar > 0
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : item.kalanMiktar === 0
                                        ? 'bg-slate-100 text-slate-600'
                                        : 'bg-red-100 text-red-700'
                                    }`}
                                  >
                                    {formatNumber(item.kalanMiktar, 2)} {item.birim}
                                  </span>
                                </td>
                                <td className="px-2 py-2.5 text-right font-mono text-slate-700">
                                  {formatCurrency(item.ortalamaBirimFiyat)}
                                </td>
                                <td className="px-2 py-2.5 text-center font-mono">
                                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                                    %{kdvRate}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                                  {formatCurrency(item.toplamDeger)}
                                </td>
                                <td className="px-2 py-2.5 text-center text-[10px] text-slate-400">
                                  {item.sonIslemTarihi || '-'}
                                </td>
                                <td className="px-2 py-2.5 text-center flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingStockItem(item);
                                      setEditForm({
                                        urunAdi: item.urunAdi,
                                        kategori: item.kategori,
                                        birim: item.birim,
                                        kalanMiktar: item.kalanMiktar,
                                        ortalamaBirimFiyat: item.ortalamaBirimFiyat,
                                        kdvOrani: item.kdvOrani !== undefined ? item.kdvOrani : 20,
                                      });
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center"
                                    title="Bu kalemi düzenle"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteStockItem(item.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center"
                                    title="Bu ürünü mizandan sil"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-100/90 font-bold border-t border-slate-300 text-slate-900">
                          <tr>
                            <td colSpan={3} className="px-3 py-2.5 text-slate-700">Kategori Toplamı ({filteredStockItems.length} Kalem)</td>
                            <td className="px-2 py-2.5 text-center font-mono text-emerald-700">
                              +{formatNumber(filteredStockItems.reduce((s, i) => s + i.toplamGiris, 0), 2)}
                            </td>
                            <td className="px-2 py-2.5 text-center font-mono text-amber-700">
                              -{formatNumber(filteredStockItems.reduce((s, i) => s + i.toplamCikis, 0), 2)}
                            </td>
                            <td className="px-2 py-2.5 text-center font-mono text-indigo-900">
                              {formatNumber(filteredStockItems.reduce((s, i) => s + i.kalanMiktar, 0), 2)}
                            </td>
                            <td className="px-2 py-2.5"></td>
                            <td className="px-2 py-2.5"></td>
                            <td className="px-3 py-2.5 text-right font-mono font-black text-slate-900">
                              {formatCurrency(filteredStockItems.reduce((s, i) => s + i.toplamDeger, 0))}
                            </td>
                            <td colSpan={2}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Pagination Bar for Category Detail */}
                    {filteredStockItems.length > 0 && (
                      <div className="bg-slate-50 border-t border-slate-200 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                        <div className="flex items-center gap-2">
                          <span>
                            {catStockPageSize === -1 ? (
                              <>Toplam <strong>{filteredStockItems.length}</strong> ürün</>
                            ) : (
                              <>
                                Gösterilen: <strong>{(safeCatStockPage - 1) * catStockPageSize + 1} - {Math.min(safeCatStockPage * catStockPageSize, filteredStockItems.length)}</strong> / <strong>{filteredStockItems.length}</strong>
                              </>
                            )}
                          </span>
                          <div className="flex items-center gap-1 ml-2">
                            <span className="text-[11px] text-slate-400">Sayfa Başı:</span>
                            <select
                              value={catStockPageSize}
                              onChange={(e) => {
                                setCatStockPageSize(Number(e.target.value));
                                setCatStockCurrentPage(1);
                              }}
                              className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 cursor-pointer"
                            >
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                              <option value={250}>250</option>
                              <option value={-1}>Tümü</option>
                            </select>
                          </div>
                        </div>

                        {catStockPageSize !== -1 && catStockTotalPages > 1 && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setCatStockCurrentPage(1)}
                              disabled={safeCatStockPage === 1}
                              className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                            >
                              <ChevronsLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCatStockCurrentPage((p) => Math.max(1, p - 1))}
                              disabled={safeCatStockPage === 1}
                              className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-2 py-0.5 font-semibold text-slate-700 font-mono">
                              {safeCatStockPage} / {catStockTotalPages}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCatStockCurrentPage((p) => Math.min(catStockTotalPages, p + 1))}
                              disabled={safeCatStockPage === catStockTotalPages}
                              className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCatStockCurrentPage(catStockTotalPages)}
                              disabled={safeCatStockPage === catStockTotalPages}
                              className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                            >
                              <ChevronsRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* View 2: Full Stock Table View */}
        {activeSubTab === 'tum-stok' && (
          <div className="flex flex-col">
            <div className="overflow-x-auto min-h-[400px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-600 font-bold border-b border-slate-200 z-10">
                  <tr>
                    <th className="w-12 px-3 py-2.5 text-center">#</th>
                    <th className="w-36 px-3 py-2.5">Kategori</th>
                    <th className="px-3 py-2.5 min-w-[200px]">Ürün Adı</th>
                    <th className="w-20 px-2 py-2.5 text-center">Birim</th>
                    <th className="w-24 px-2 py-2.5 text-center text-emerald-700">Toplam Giriş</th>
                    <th className="w-24 px-2 py-2.5 text-center text-amber-700">Toplam Çıkış</th>
                    <th className="w-28 px-2 py-2.5 text-center font-bold text-indigo-900 bg-indigo-50">
                      Kalan Stok
                    </th>
                    <th className="w-24 px-2 py-2.5 text-right">Ortalama Fiyat</th>
                    <th className="w-20 px-2 py-2.5 text-center text-indigo-700 font-bold">KDV %</th>
                    <th className="w-28 px-3 py-2.5 text-right font-bold text-slate-900">Toplam Değer (₺)</th>
                    <th className="w-16 px-2 py-2.5 text-center">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredStockItems.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        Mizanda gösterilecek ürün kaydı bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    paginatedAllStockItems.map((item, idx) => {
                      const globalIdx = (safeAllStockPage - 1) * (allStockPageSize === -1 ? 0 : allStockPageSize) + idx;
                      const kdvRate = item.kdvOrani !== undefined ? item.kdvOrani : 20;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2 text-center text-slate-400 font-mono text-[11px]">
                            {globalIdx + 1}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={item.kategori}
                              onChange={(e) => {
                                const newCat = e.target.value;
                                if (onUpdateStockItem) {
                                  onUpdateStockItem(item.id, { kategori: newCat });
                                }
                              }}
                              className="bg-indigo-50/70 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 font-semibold text-xs rounded-md px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer transition-colors max-w-[150px] truncate"
                              title="Ürünün kategorisini değiştirmek için seçin"
                            >
                              {mizanCategories.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                              {!mizanCategories.includes(item.kategori) && (
                                <option value={item.kategori}>{item.kategori}</option>
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{item.urunAdi}</td>
                          <td className="px-2 py-2 text-center text-slate-500 italic">{item.birim}</td>
                          <td className="px-2 py-2 text-center font-mono font-semibold text-emerald-700">
                            +{formatNumber(item.toplamGiris, 2)}
                          </td>
                          <td className="px-2 py-2 text-center font-mono font-semibold text-amber-700">
                            -{formatNumber(item.toplamCikis, 2)}
                          </td>
                          <td className="px-2 py-2 text-center font-mono font-bold bg-indigo-50/30">
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${
                                item.kalanMiktar > 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.kalanMiktar === 0
                                  ? 'bg-slate-100 text-slate-600'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {formatNumber(item.kalanMiktar, 2)} {item.birim}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-slate-700">
                            {formatCurrency(item.ortalamaBirimFiyat)}
                          </td>
                          <td className="px-2 py-2 text-center font-mono">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                              %{kdvRate}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(item.toplamDeger)}
                          </td>
                          <td className="px-2 py-2 text-center flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStockItem(item);
                                setEditForm({
                                  urunAdi: item.urunAdi,
                                  kategori: item.kategori,
                                  birim: item.birim,
                                  kalanMiktar: item.kalanMiktar,
                                  ortalamaBirimFiyat: item.ortalamaBirimFiyat,
                                  kdvOrani: item.kdvOrani !== undefined ? item.kdvOrani : 20,
                                });
                              }}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center"
                              title="Bu kalemi düzenle"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteStockItem(item.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center"
                              title="Bu ürünü mizandan sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="bg-slate-100/90 font-bold border-t border-slate-300 text-slate-900">
                  <tr>
                    <td colSpan={4} className="px-3 py-2.5 text-slate-700">GENEL TOPLAM ({stockItems.length} Kalem)</td>
                    <td className="px-2 py-2.5 text-center font-mono text-emerald-700">
                      +{formatNumber(totalGiris, 2)}
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono text-amber-700">
                      -{formatNumber(totalCikis, 2)}
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono text-indigo-900">
                      {formatNumber(totalQuantity, 2)}
                    </td>
                    <td className="px-2 py-2.5"></td>
                    <td className="px-2 py-2.5"></td>
                    <td className="px-3 py-2.5 text-right font-mono font-black text-slate-900">
                      {formatCurrency(totalValue)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination Bar for Tüm Stok */}
            {filteredStockItems.length > 0 && (
              <div className="bg-slate-50 border-t border-slate-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span>
                    {allStockPageSize === -1 ? (
                      <>Toplam <strong>{filteredStockItems.length}</strong> ürün</>
                    ) : (
                      <>
                        Gösterilen: <strong>{(safeAllStockPage - 1) * allStockPageSize + 1} - {Math.min(safeAllStockPage * allStockPageSize, filteredStockItems.length)}</strong> / <strong>{filteredStockItems.length}</strong>
                      </>
                    )}
                  </span>
                  <div className="flex items-center gap-1 ml-2">
                    <span className="text-[11px] text-slate-400">Sayfa Başı:</span>
                    <select
                      value={allStockPageSize}
                      onChange={(e) => {
                        setAllStockPageSize(Number(e.target.value));
                        setAllStockCurrentPage(1);
                      }}
                      className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 cursor-pointer"
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={500}>500</option>
                      <option value={-1}>Tümü</option>
                    </select>
                  </div>
                </div>

                {allStockPageSize !== -1 && allStockTotalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setAllStockCurrentPage(1)}
                      disabled={safeAllStockPage === 1}
                      className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronsLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllStockCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safeAllStockPage === 1}
                      className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 py-0.5 font-semibold text-slate-700 font-mono">
                      {safeAllStockPage} / {allStockTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAllStockCurrentPage((p) => Math.min(allStockTotalPages, p + 1))}
                      disabled={safeAllStockPage === allStockTotalPages}
                      className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllStockCurrentPage(allStockTotalPages)}
                      disabled={safeAllStockPage === allStockTotalPages}
                      className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* View 3: Movements History Table */}
        {activeSubTab === 'hareketler' && (
          <div className="flex flex-col">
            <div className="overflow-x-auto min-h-[400px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-600 font-bold border-b border-slate-200 z-10">
                  <tr>
                    <th className="w-12 px-3 py-2.5 text-center">#</th>
                    <th className="w-24 px-3 py-2.5">Tarih</th>
                    <th className="w-28 px-3 py-2.5 text-center">İşlem Türü</th>
                    <th className="w-32 px-3 py-2.5">Belge / Fatura No</th>
                    <th className="w-32 px-3 py-2.5">Kategori</th>
                    <th className="px-3 py-2.5 min-w-[200px]">Ürün Adı</th>
                    <th className="w-20 px-2 py-2.5 text-center">Miktar</th>
                    <th className="w-16 px-2 py-2.5 text-center">Birim</th>
                    <th className="w-24 px-2 py-2.5 text-right">Birim Fiyat</th>
                    <th className="w-20 px-2 py-2.5 text-center text-indigo-700 font-bold">KDV %</th>
                    <th className="w-28 px-3 py-2.5 text-right font-bold text-slate-900">Toplam Tutar (₺)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        Henüz kaydedilmiş bir stok hareketi bulunmuyor.
                      </td>
                    </tr>
                  ) : (
                    paginatedMovements.map((mov, idx) => {
                      const globalIdx = (safeMovPage - 1) * (movPageSize === -1 ? 0 : movPageSize) + idx;
                      const kdvRate = mov.kdvOrani !== undefined ? mov.kdvOrani : 20;
                      const matrah = mov.miktar * mov.birimFiyat;

                      return (
                        <tr key={mov.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2 text-center text-slate-400 font-mono text-[11px]">
                            {globalIdx + 1}
                          </td>
                          <td className="px-3 py-2 text-slate-500 font-mono text-[11px]">
                            {mov.tarih}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {mov.islemTipi === 'giris' ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                                <ArrowUpRight className="w-3 h-3" />
                                Stok Giriş (+)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                                <ArrowDownLeft className="w-3 h-3" />
                                Stok Çıkış (-)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {mov.faturaNo || '-'}
                          </td>
                          <td className="px-3 py-2">
                            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px]">
                              {mov.kategori}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{mov.urunAdi}</td>
                          <td className="px-2 py-2 text-center font-mono font-bold">
                            {mov.islemTipi === 'giris' ? '+' : '-'}
                            {formatNumber(mov.miktar, 2)}
                          </td>
                          <td className="px-2 py-2 text-center text-slate-500 italic">{mov.birim}</td>
                          <td className="px-2 py-2 text-right font-mono text-slate-700">
                            {formatCurrency(mov.birimFiyat)}
                          </td>
                          <td className="px-2 py-2 text-center font-mono">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                              %{kdvRate}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(matrah)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Bar for Movements */}
            {filteredMovements.length > 0 && (
              <div className="bg-slate-50 border-t border-slate-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span>
                    {movPageSize === -1 ? (
                      <>Toplam <strong>{filteredMovements.length}</strong> hareket</>
                    ) : (
                      <>
                        Gösterilen: <strong>{(safeMovPage - 1) * movPageSize + 1} - {Math.min(safeMovPage * movPageSize, filteredMovements.length)}</strong> / <strong>{filteredMovements.length}</strong>
                      </>
                    )}
                  </span>
                  <div className="flex items-center gap-1 ml-2">
                    <span className="text-[11px] text-slate-400">Sayfa Başı:</span>
                    <select
                      value={movPageSize}
                      onChange={(e) => {
                        setMovPageSize(Number(e.target.value));
                        setMovCurrentPage(1);
                      }}
                      className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 cursor-pointer"
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={500}>500</option>
                      <option value={-1}>Tümü</option>
                    </select>
                  </div>
                </div>

                {movPageSize !== -1 && movTotalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setMovCurrentPage(1)}
                      disabled={safeMovPage === 1}
                      className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronsLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safeMovPage === 1}
                      className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 py-0.5 font-semibold text-slate-700 font-mono">
                      {safeMovPage} / {movTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMovCurrentPage((p) => Math.min(movTotalPages, p + 1))}
                      disabled={safeMovPage === movTotalPages}
                      className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovCurrentPage(movTotalPages)}
                      disabled={safeMovPage === movTotalPages}
                      className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* View 4: Mizan Kategorileri & Hesap Planı */}
        {activeSubTab === 'kategoriler' && (
          <div className="p-4 sm:p-6 space-y-6">
            {/* Explanatory Info Card */}
            <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">
                    Mizan Kategori ve Hesap Planı Yönetimi
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5 max-w-2xl leading-relaxed">
                    Ürünlerdeki ve faturalardaki tüm kategoriler bu liste üzerinden belirlenir. Fatura okurken AI yalnızca buradaki kategorileri eşleştirir, editörde ve Excel tablosunda yalnızca bu listedeki kategoriler seçilebilir.
                  </p>
                </div>
              </div>

              <div className="text-xs bg-white px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-900 font-bold shrink-0">
                {mizanCategories.length} Tanımlı Kategori
              </div>
            </div>

            {/* Inline Add New Category Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs">
              <h5 className="font-bold text-xs uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" />
                Mizana Yeni Kategori Ekle
              </h5>
              <form onSubmit={handleAddNewCategory} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-xl">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={newCatInput}
                    onChange={(e) => {
                      setNewCatInput(e.target.value);
                      if (catInputError) setCatInputError(null);
                    }}
                    placeholder="Örn: Hammadde, Temizlik, Ambalaj, Elektronik..."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  {catInputError && (
                    <p className="text-[11px] text-red-600 mt-1 font-semibold">
                      {catInputError}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Kategoriyi Kaydet</span>
                </button>
              </form>
            </div>

            {/* Category Bento Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h5 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                  Tanımlı Mizan Kategorileri ({mizanCategories.length})
                </h5>
                <span className="text-[11px] text-slate-400">
                  Her kategorideki stok durumunu ve değerini inceleyebilirsiniz.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                {mizanCategories.map((catName) => {
                  const inStockData = categoriesInStock.find((c) => c.kategori === catName);
                  const productCount = inStockData ? inStockData.count : 0;
                  const totalVal = inStockData ? inStockData.totalValue : 0;
                  const totalQty = inStockData
                    ? inStockData.items.reduce((s, i) => s + i.kalanMiktar, 0)
                    : 0;

                  return (
                    <div
                      key={catName}
                      className="bg-white border border-slate-200 hover:border-indigo-300 rounded-xl p-4 transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between group"
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs">
                            <Tag className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <h6 className="font-bold text-slate-900 text-xs line-clamp-1">
                              {catName}
                            </h6>
                            <span className="text-[10px] text-slate-400">
                              Mizan Hesap Grubu
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {onEditCategory && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditCategoryModal(catName)}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                              title={`"${catName}" kategorisini yeniden adlandır / düzenle`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDeleteCategory && (
                            <button
                              type="button"
                              onClick={() => handleInitiateDeleteCategory(catName)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                              title={
                                productCount > 0
                                  ? `"${catName}" kategorisinde ${productCount} ürün mevcut (Silinemez - Detayı Gör)`
                                  : `"${catName}" kategorisini Mizan'dan sil`
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-lg p-2.5 space-y-1.5 text-[11px] mb-3">
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Ürün Kalemi:</span>
                          <span className="font-bold text-slate-900 font-mono">
                            {productCount} Ürün
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Toplam Miktar:</span>
                          <span className="font-semibold text-slate-800 font-mono">
                            {formatNumber(totalQty, 1)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-200">
                          <span className="font-medium">Stok Değeri:</span>
                          <span className="font-bold text-indigo-700 font-mono">
                            {formatCurrency(totalVal)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory(catName);
                          setActiveSubTab('tum-stok');
                        }}
                        className="w-full py-1.5 px-2 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-bold text-[11px] rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>Ürünleri Listele ({productCount})</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* View 5: Eksiye Düşen Stoklar (Tüm Kategoriler) */}
        {activeSubTab === 'eksi-stoklar' && (
          <div className="p-4 sm:p-6 space-y-6">
            {/* Header Informational Banner */}
            <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-slate-950 rounded-2xl p-5 sm:p-6 text-white border border-rose-900/50 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
              <div className="space-y-1.5 max-w-2xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    <span>Mizan Stok Denetimi & Risk Kontrolü</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-white">
                    {activeCompany} ({activeYear})
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  <span>Tüm Kategorilerde Eksiye Düşen Stoklar</span>
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Mizandaki tüm ürün kategorileri taranmış olup, çıkış miktarı giriş miktarını aşmış ve bakiyesi negatife (<strong className="text-rose-300">eksi</strong>) düşmüş kalemler listelenmektedir. Buradan tek tıkla telafi girişi yapabilir veya hareket geçmişini inceleyebilirsiniz.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0 w-full md:w-auto">
                <button
                  type="button"
                  onClick={handleExportNegativeStockExcel}
                  disabled={negativeStockItems.length === 0}
                  className="px-4 py-2.5 bg-[#107c41] hover:bg-[#0b5a2f] text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer w-full sm:w-auto"
                  title="Eksiye düşen ürünlerin denetim raporunu Excel formatında indir"
                >
                  <Download className="w-4 h-4" />
                  <span>Eksi Stok Excel İndir (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(true)}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Manuel Stok Girişi</span>
                </button>
              </div>
            </div>

            {/* 4 Bento Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Stat 1: Eksi Ürün Sayısı */}
              <div className="bg-white border-2 border-rose-200/80 rounded-2xl p-4.5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                    Eksi Kalem Sayısı
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                    <AlertTriangle className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-rose-600">
                    {totalNegativeCount} Kalem
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-medium">
                    {totalStockCount > 0 ? (
                      <>Tüm mizan stoklarının <strong>%{((totalNegativeCount / totalStockCount) * 100).toFixed(1)}</strong>'i</>
                    ) : (
                      'Mizanda kayıtlı ürün yok'
                    )}
                  </div>
                </div>
              </div>

              {/* Stat 2: Toplam Miktar Açığı */}
              <div className="bg-white border-2 border-rose-200/80 rounded-2xl p-4.5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                    Toplam Miktar Açığı
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                    <TrendingDown className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-rose-700">
                    {formatNumber(totalNegativeQuantity, 2)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-medium">
                    Gerekli telafi: <strong className="text-emerald-700 font-mono">+{formatNumber(Math.abs(totalNegativeQuantity), 2)}</strong> birim
                  </div>
                </div>
              </div>

              {/* Stat 3: Etkilenen Kategori Sayısı */}
              <div className="bg-white border-2 border-amber-200/80 rounded-2xl p-4.5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                    Etkilenen Kategori
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                    <Tag className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-amber-700">
                    {affectedNegativeCategories.length} Kategori
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-medium truncate" title={affectedNegativeCategories.map((c) => c.kategori).join(', ')}>
                    {affectedNegativeCategories.length > 0
                      ? affectedNegativeCategories.map((c) => c.kategori).slice(0, 3).join(', ') + (affectedNegativeCategories.length > 3 ? '...' : '')
                      : 'Hiçbir kategori etkilenmedi'}
                  </div>
                </div>
              </div>

              {/* Stat 4: Tahmini Değer Açığı */}
              <div className="bg-white border-2 border-slate-200 rounded-2xl p-4.5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Maliyet Değer Açığı
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                    <Receipt className="w-4.5 h-4.5" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-rose-700">
                    {formatCurrency(totalNegativeValue)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-medium">
                    KDV Dahil Açık: <strong className="font-mono text-slate-700">{formatCurrency(totalNegativeGrossValue)}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter and Sorting Toolbar */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-2xs">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                {/* Search in Negative Items */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setNegStockCurrentPage(1);
                    }}
                    placeholder="Eksi ürün adı, kategori veya KDV oranı ara..."
                    className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Right Controls: Sort & Page Size */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700">
                    <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-500 text-[11px]">Sırala:</span>
                    <select
                      value={negSortBy}
                      onChange={(e) => setNegSortBy(e.target.value as any)}
                      className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer text-xs"
                    >
                      <option value="quantity-asc">En Çok Eksiye Düşen (En Büyük Açık)</option>
                      <option value="quantity-desc">En Az Eksiye Düşen (Sıfıra En Yakın)</option>
                      <option value="value-asc">En Yüksek Tutar Açığı</option>
                      <option value="name-asc">Ürün Adı (A-Z)</option>
                      <option value="date-desc">Son İşlem Tarihi (En Yeni)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700">
                    <span className="text-slate-500 text-[11px]">Sayfa Başı:</span>
                    <select
                      value={negStockPageSize}
                      onChange={(e) => {
                        setNegStockPageSize(Number(e.target.value));
                        setNegStockCurrentPage(1);
                      }}
                      className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer text-xs"
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={-1}>Tümü</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Affected Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-200/70 text-xs">
                <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider whitespace-nowrap mr-1">
                  Kategori Filtresi:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setNegSelectedCategory('all');
                    setNegStockCurrentPage(1);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    negSelectedCategory === 'all'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Tüm Kategoriler ({negativeStockItems.length})
                </button>
                {affectedNegativeCategories.map((cat) => (
                  <button
                    key={cat.kategori}
                    type="button"
                    onClick={() => {
                      setNegSelectedCategory(cat.kategori);
                      setNegStockCurrentPage(1);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                      negSelectedCategory === cat.kategori
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>{cat.kategori}</span>
                    <span className="text-[10px] opacity-80 font-mono">({cat.count})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Content Table or Empty State */}
            {totalNegativeCount === 0 ? (
              /* Tamamen Temiz / Eksi Ürün Yok Durumu */
              <div className="bg-emerald-50/50 border-2 border-emerald-200 rounded-2xl p-10 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="max-w-md mx-auto space-y-1.5">
                  <h4 className="text-lg font-bold text-emerald-950">
                    Tebrikler! Mizanınızda Eksiye Düşen Ürün Bulunmuyor
                  </h4>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Tüm kategorilerdeki kayıtlı ürünlerin kalan stok miktarları sıfır veya pozitif seviyededir. Herhangi bir stok açığı veya eksi bakiye tespit edilmedi.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('kategori')}
                    className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-2xs"
                  >
                    Kategori Bazlı Mizana Dön
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('tum-stok')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-xs"
                  >
                    Tüm Stok Listesini Görüntüle
                  </button>
                </div>
              </div>
            ) : filteredNegativeStockItems.length === 0 ? (
              /* Arama / Filtre Sonucu Bulunamadı */
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Search className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h5 className="font-bold text-slate-800 text-sm">Filtreye Uygun Eksi Stok Bulunamadı</h5>
                  <p className="text-xs text-slate-500">
                    "{searchTerm}" aramasına veya seçili kategoriye ait eksiye düşen bir ürün kalemi yok.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setNegSelectedCategory('all');
                  }}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Filtreleri Temizle
                </button>
              </div>
            ) : (
              /* Eksiye Düşen Ürünler Tablosu */
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <div className="overflow-x-auto min-h-[400px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-rose-50/70 text-slate-700 font-bold border-b border-rose-200 z-10 backdrop-blur-xs">
                      <tr>
                        <th className="w-12 px-3 py-3 text-center">#</th>
                        <th className="w-36 px-3 py-3">Kategori</th>
                        <th className="px-3 py-3 min-w-[220px]">Ürün / Hizmet Adı</th>
                        <th className="w-16 px-2 py-3 text-center">Birim</th>
                        <th className="w-24 px-2 py-3 text-center font-mono">Toplam Giriş (+)</th>
                        <th className="w-24 px-2 py-3 text-center font-mono">Toplam Çıkış (-)</th>
                        <th className="w-36 px-3 py-3 text-center font-mono bg-rose-100/60 text-rose-950 font-black">
                          Eksi Bakiye (Net)
                        </th>
                        <th className="w-28 px-2 py-3 text-right">Ort. Birim Fiyat</th>
                        <th className="w-20 px-2 py-3 text-center">KDV %</th>
                        <th className="w-32 px-3 py-3 text-right font-black text-rose-950">Maliyet Açığı (₺)</th>
                        <th className="w-28 px-2 py-3 text-center">Son İşlem</th>
                        <th className="w-56 px-3 py-3 text-center">Hızlı Çözüm / Aksiyon</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {paginatedNegativeStockItems.map((item, idx) => {
                        const globalIdx = (safeNegStockPage - 1) * (negStockPageSize === -1 ? 0 : negStockPageSize) + idx;
                        const kdvRate = item.kdvOrani !== undefined ? item.kdvOrani : 20;
                        const deficitAmount = Math.abs(item.kalanMiktar);

                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-rose-50/40 transition-colors group"
                          >
                            <td className="px-3 py-2.5 text-center text-slate-400 font-mono text-[11px]">
                              {globalIdx + 1}
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setNegSelectedCategory(item.kategori);
                                  setNegStockCurrentPage(1);
                                }}
                                className="bg-slate-100 hover:bg-rose-100 hover:text-rose-800 text-slate-700 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer text-left"
                                title={`Bu kategorideki (${item.kategori}) eksi ürünleri filtrele`}
                              >
                                {item.kategori}
                              </button>
                            </td>
                            <td className="px-3 py-2.5 font-bold text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                                <span className="line-clamp-2">{item.urunAdi}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-center text-slate-500 italic">
                              {item.birim}
                            </td>
                            <td className="px-2 py-2.5 text-center font-mono font-semibold text-emerald-700">
                              +{formatNumber(item.toplamGiris, 2)}
                            </td>
                            <td className="px-2 py-2.5 text-center font-mono font-semibold text-amber-700">
                              -{formatNumber(item.toplamCikis, 2)}
                            </td>
                            <td className="px-3 py-2.5 text-center font-mono bg-rose-50/60">
                              <div className="inline-flex flex-col items-center">
                                <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">
                                  {formatNumber(item.kalanMiktar, 2)} {item.birim}
                                </span>
                                <span className="text-[10px] text-rose-600 font-semibold mt-0.5">
                                  ({formatNumber(deficitAmount, 2)} açık)
                                </span>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono text-slate-700 font-medium">
                              {formatCurrency(item.ortalamaBirimFiyat)}
                            </td>
                            <td className="px-2 py-2.5 text-center font-mono">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                                %{kdvRate}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-black text-rose-700">
                              {formatCurrency(item.toplamDeger)}
                            </td>
                            <td className="px-2 py-2.5 text-center text-[10px] text-slate-400 font-mono">
                              {item.sonIslemTarihi || '-'}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => handleOpenReconcileModal(item)}
                                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer hover:shadow-xs"
                                  title={`"${item.urunAdi}" için stok düzelt: Başka bir stoktan ${deficitAmount} ${item.birim} düş ve bu eksideki stoğu sil`}
                                >
                                  <ArrowRightLeft className="w-3 h-3" />
                                  <span>Stok Düzelt</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleQuickCompensate(item)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer hover:shadow-xs"
                                  title={`"${item.urunAdi}" için eksik olan ${deficitAmount} ${item.birim} kadar stok girişi yap`}
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Telafi Girişi Ekle</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleViewMovementsForProduct(item.urunAdi)}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                                  title="Bu ürünün tüm giriş/çıkış hareketlerini incele"
                                >
                                  <ArrowDownLeft className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingStockItem(item);
                                    setEditForm({
                                      urunAdi: item.urunAdi,
                                      kategori: item.kategori,
                                      birim: item.birim,
                                      kalanMiktar: item.kalanMiktar,
                                      ortalamaBirimFiyat: item.ortalamaBirimFiyat,
                                      kdvOrani: item.kdvOrani !== undefined ? item.kdvOrani : 20,
                                    });
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                                  title="Bu kalemi düzenle"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => onDeleteStockItem(item.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                                  title="Bu ürünü mizandan sil"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-rose-50/80 font-bold border-t-2 border-rose-200 text-slate-900">
                      <tr>
                        <td colSpan={4} className="px-3 py-3 text-slate-800 font-bold">
                          TOPLAM EKSİ STOK AÇIĞI ({filteredNegativeStockItems.length} Kalem)
                        </td>
                        <td className="px-2 py-3 text-center font-mono text-emerald-700">
                          +{formatNumber(filteredNegativeStockItems.reduce((s, i) => s + i.toplamGiris, 0), 2)}
                        </td>
                        <td className="px-2 py-3 text-center font-mono text-amber-700">
                          -{formatNumber(filteredNegativeStockItems.reduce((s, i) => s + i.toplamCikis, 0), 2)}
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-rose-800 font-black bg-rose-100/70">
                          {formatNumber(filteredNegativeStockItems.reduce((s, i) => s + i.kalanMiktar, 0), 2)}
                        </td>
                        <td colSpan={2}></td>
                        <td className="px-3 py-3 text-right font-mono font-black text-rose-700">
                          {formatCurrency(filteredNegativeStockItems.reduce((s, i) => s + i.toplamDeger, 0))}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Pagination Bar for Negative Stock Table */}
                {filteredNegativeStockItems.length > 0 && (
                  <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <span>
                        {negStockPageSize === -1 ? (
                          <>Toplam <strong>{filteredNegativeStockItems.length}</strong> eksi stok ürünü</>
                        ) : (
                          <>
                            Gösterilen: <strong>{(safeNegStockPage - 1) * negStockPageSize + 1} - {Math.min(safeNegStockPage * negStockPageSize, filteredNegativeStockItems.length)}</strong> / <strong>{filteredNegativeStockItems.length}</strong>
                          </>
                        )}
                      </span>
                    </div>

                    {negStockPageSize !== -1 && negStockTotalPages > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setNegStockCurrentPage(1)}
                          disabled={safeNegStockPage === 1}
                          className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronsLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setNegStockCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={safeNegStockPage === 1}
                          className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2 py-0.5 font-semibold text-slate-700 font-mono">
                          {safeNegStockPage} / {negStockTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setNegStockCurrentPage((p) => Math.min(negStockTotalPages, p + 1))}
                          disabled={safeNegStockPage === negStockTotalPages}
                          className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setNegStockCurrentPage(negStockTotalPages)}
                          disabled={safeNegStockPage === negStockTotalPages}
                          className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronsRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Add Category Modal Dialog (accessible anywhere) */}
      {isAddCatModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-800">
                  Mizana Yeni Kategori Ekle
                </h3>
                <p className="text-xs text-slate-500">
                  Bu kategori tüm fatura taramalarında ve Excel tablosunda geçerli olacaktır.
                </p>
              </div>
            </div>

            <form onSubmit={handleAddNewCategory} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Kategori Adı
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newCatInput}
                  onChange={(e) => {
                    setNewCatInput(e.target.value);
                    if (catInputError) setCatInputError(null);
                  }}
                  placeholder="Örn: Hammadde, Kırtasiye, Yedek Parça, Temizlik..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {catInputError && (
                  <p className="text-[11px] text-red-600 mt-1 font-semibold">
                    {catInputError}
                  </p>
                )}
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-600 text-[11px] space-y-1">
                <p className="font-bold text-slate-700">Mevcut Kategoriler ({mizanCategories.length}):</p>
                <p className="line-clamp-2 text-slate-500 font-mono">
                  {mizanCategories.join(', ')}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddCatModalOpen(false)}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  Kategoriyi Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Category Modal Dialog */}
      {isEditCatModalOpen && editCatModalOldName && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-800">
                  Kategori İsmini Düzenle
                </h3>
                <p className="text-xs text-slate-500">
                  Yeni isim tüm stok kartlarına, hareketlere ve faturalara otomatik yansıtılır.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveEditCategory} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  Mevcut İsim: <span className="text-indigo-600 font-mono font-bold">{editCatModalOldName}</span>
                </label>
                <label className="block font-bold text-slate-700 mb-1">
                  Yeni Kategori Adı
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editCatModalNewName}
                  onChange={(e) => {
                    setEditCatModalNewName(e.target.value);
                    if (editCatError) setEditCatError(null);
                  }}
                  placeholder="Yeni kategori adını yazın..."
                  className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                />
                {editCatError && (
                  <p className="text-[11px] text-red-600 mt-1 font-semibold">
                    {editCatError}
                  </p>
                )}
              </div>

              <div className="bg-amber-50/80 p-3 rounded-lg border border-amber-200 text-amber-900 text-[11px] space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                  <span>Otomatik Senkronizasyon</span>
                </p>
                <p className="text-amber-800 leading-relaxed">
                  İsim değişikliği onaylandığında bu kategoriye ait tüm Mizan stokları, geçmiş stok hareketleri ve fatura kayıtları otomatik olarak yeni kategori ismine güncellenecektir.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditCatModalOpen(false);
                    setEditCatModalOldName(null);
                  }}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Kaydet ve Güncelle</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kategori Silme ve Koruma Onay Modalı */}
      {categoryDeleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 space-y-4">
            {categoryDeleteTarget.products.length > 0 ? (
              /* SİLME ENGELLENDİ: İÇERİSİNDE ÜRÜN MEVCUT */
              <>
                <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
                  <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-base">
                        Kategori Silinemez!
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                        {categoryDeleteTarget.products.length} Ürün Mevcut
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <strong className="text-slate-800">"{categoryDeleteTarget.name}"</strong> kategorisinde kayıtlı ürünler bulunduğu için bu kategori silinemez.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCategoryDeleteTarget(null)}
                    className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2">
                  <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <span>⚠️ Kategori Silme Kuralı:</span>
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Mizan ve stok tutarlılığını korumak amacıyla, içinde ürün bulunan kategorilerin silinmesine izin verilmez. Bu kategoriyi silebilmek için önce listedeki ürünlerin kategorisini düzenleyerek başka bir kategoriye taşımalı veya ürün kayıtlarını silmelisiniz.
                  </p>
                </div>

                {/* Kategori İçerisindeki Ürünlerin Listesi */}
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                    <span>Bu Kategorideki Kayıtlı Ürünler ({categoryDeleteTarget.products.length}):</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50">
                    {categoryDeleteTarget.products.map((item) => (
                      <div key={item.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-white transition-colors">
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-800 truncate">{item.urunAdi}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            Stok: {formatNumber(item.kalanMiktar, 2)} {item.birim} • Birim Fiyat: {formatCurrency(item.ortalamaBirimFiyat)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold font-mono text-slate-900">
                            {formatCurrency(item.toplamDeger)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setCategoryDeleteTarget(null)}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-xs"
                  >
                    Anladım / Kapat
                  </button>
                </div>
              </>
            ) : (
              /* ONAY: KATEGORİ BOŞ VE SİLİNEBİLİR */
              <>
                <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
                  <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-base">
                      Kategoriyi Sil
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Mizan kategori tanımını kaldırmak üzeresiniz.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCategoryDeleteTarget(null)}
                    className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                  <p className="text-slate-700">
                    <strong className="text-slate-900">"{categoryDeleteTarget.name}"</strong> kategorisinde kayıtlı herhangi bir ürün bulunmamaktadır.
                  </p>
                  <p className="text-slate-500 text-[11px]">
                    Bu kategoriyi sildiğinizde artık fatura aktarımlarında ve manuel mizan işlemlerinde bu kategori seçilemez.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setCategoryDeleteTarget(null)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteCategory}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Evet, Kategoriyi Sil</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Manual Movement Modal Dialog */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="font-bold text-base text-slate-800 mb-1">
              Manuel Stok Girişi / Çıkışı
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Mizana doğrudan stok ekleyebilir veya düşebilirsiniz.
            </p>

            <form onSubmit={handleManualSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">İşlem Türü</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualForm({ ...manualForm, islemTipi: 'giris' })}
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      manualForm.islemTipi === 'giris'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>Stok Ekle (+)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualForm({ ...manualForm, islemTipi: 'cikis' })}
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      manualForm.islemTipi === 'cikis'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4" />
                    <span>Stok Düşür (-)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ürün Adı</label>
                <input
                  type="text"
                  required
                  value={manualForm.urunAdi}
                  onChange={(e) => setManualForm({ ...manualForm, urunAdi: e.target.value })}
                  placeholder="Örn: A4 Fotokopi Kağıdı 80gr"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kategori</label>
                  <select
                    value={manualForm.kategori}
                    onChange={(e) => setManualForm({ ...manualForm, kategori: e.target.value })}
                    className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    {mizanCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Birim</label>
                  <input
                    type="text"
                    value={manualForm.birim}
                    onChange={(e) => setManualForm({ ...manualForm, birim: e.target.value })}
                    placeholder="Adet, Koli, Kg"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Miktar</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={manualForm.miktar}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, miktar: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Eksi miktar (-10) girilebilir</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Birim Fiyat (KDV Hariç ₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={manualForm.birimFiyat}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, birimFiyat: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Eksi fiyat (-50 ₺) girilebilir</p>
                </div>
              </div>

              {/* KDV Oranı Seçimi */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">KDV Oranı (%)</label>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {[20, 10, 1, 0].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setManualForm({ ...manualForm, kdvOrani: rate })}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs border transition-all cursor-pointer ${
                        Number(manualForm.kdvOrani) === rate
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      %{rate}
                    </button>
                  ))}
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] space-y-1 font-mono">
                  <div className="flex justify-between text-slate-600">
                    <span>Matrah (KDV Hariç):</span>
                    <span className="font-bold text-slate-800">
                      {formatCurrency((Number(manualForm.miktar) || 0) * (Number(manualForm.birimFiyat) || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-amber-700">
                    <span>KDV Tutarı (%{manualForm.kdvOrani}):</span>
                    <span className="font-bold">
                      +{formatCurrency(
                        ((Number(manualForm.miktar) || 0) * (Number(manualForm.birimFiyat) || 0) * (Number(manualForm.kdvOrani) || 0)) / 100
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-800 font-black pt-1 border-t border-slate-200">
                    <span>KDV Dahil Toplam:</span>
                    <span>
                      {formatCurrency(
                        (Number(manualForm.miktar) || 0) *
                          (Number(manualForm.birimFiyat) || 0) *
                          (1 + (Number(manualForm.kdvOrani) || 0) / 100)
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Belge / Fatura No / Not</label>
                <input
                  type="text"
                  value={manualForm.faturaNo}
                  onChange={(e) => setManualForm({ ...manualForm, faturaNo: e.target.value })}
                  placeholder="Manuel Giriş / Sayım Fazlası"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  Mizana Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Stock Item Modal */}
      {editingStockItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="font-bold text-base text-slate-800 mb-1">
              Mizan Stok Kalemini Düzenle
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Ürün adını, kategori, birim, miktar, KDV oranı veya birim fiyatını güncelleyin.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (onUpdateStockItem) {
                  onUpdateStockItem(editingStockItem.id, editForm);
                }
                setEditingStockItem(null);
              }}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">Ürün / Hizmet Adı</label>
                <input
                  type="text"
                  required
                  value={editForm.urunAdi}
                  onChange={(e) => setEditForm({ ...editForm, urunAdi: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kategori</label>
                  <select
                    value={editForm.kategori}
                    onChange={(e) => setEditForm({ ...editForm, kategori: e.target.value })}
                    className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    {mizanCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Birim</label>
                  <input
                    type="text"
                    value={editForm.birim}
                    onChange={(e) => setEditForm({ ...editForm, birim: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kalan Miktar (Net)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editForm.kalanMiktar}
                    onChange={(e) =>
                      setEditForm({ ...editForm, kalanMiktar: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Birim Fiyat (KDV Hariç ₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.ortalamaBirimFiyat}
                    onChange={(e) =>
                      setEditForm({ ...editForm, ortalamaBirimFiyat: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* KDV Oranı Düzenleme */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">KDV Oranı (%)</label>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {[20, 10, 1, 0].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, kdvOrani: rate })}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs border transition-all cursor-pointer ${
                        Number(editForm.kdvOrani) === rate
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      %{rate}
                    </button>
                  ))}
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] space-y-1 font-mono">
                  <div className="flex justify-between text-slate-600">
                    <span>Matrah (KDV Hariç):</span>
                    <span className="font-bold text-slate-800">
                      {formatCurrency((Number(editForm.kalanMiktar) || 0) * (Number(editForm.ortalamaBirimFiyat) || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-amber-700">
                    <span>KDV Tutarı (%{editForm.kdvOrani}):</span>
                    <span className="font-bold">
                      +{formatCurrency(
                        ((Number(editForm.kalanMiktar) || 0) * (Number(editForm.ortalamaBirimFiyat) || 0) * (Number(editForm.kdvOrani) || 0)) / 100
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-800 font-black pt-1 border-t border-slate-200">
                    <span>KDV Dahil Toplam Değer:</span>
                    <span>
                      {formatCurrency(
                        (Number(editForm.kalanMiktar) || 0) *
                          (Number(editForm.ortalamaBirimFiyat) || 0) *
                          (1 + (Number(editForm.kdvOrani) || 0) / 100)
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingStockItem(null)}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  Güncellemeyi Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mizan Sıfırlama Çarpım Tablosu Onay Modalı */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 mb-1">
                Mizanı Sıfırla / Tüm Verileri Sil
              </h3>
              <p className="text-xs text-slate-500">
                Bu işlem tüm mizan stok kayıtlarını ve hareket geçmişini kalıcı olarak silecektir. Güvenlik için lütfen aşağıdaki çarpım işleminin sonucunu giriniz:
              </p>
            </div>

            <div className="bg-slate-100 py-3 px-4 rounded-xl text-lg font-black text-slate-800 font-mono tracking-wider">
              {clearMath.num1} × {clearMath.num2} = ?
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (Number(clearUserInput.trim()) === clearMath.expectedAnswer) {
                  onClearMizan();
                  setIsClearModalOpen(false);
                  setClearUserInput('');
                  setClearError(null);
                } else {
                  setClearError('❌ Hatalı sonuç! Çarpım sonucunu doğru giriniz.');
                }
              }}
              className="space-y-3"
            >
              <input
                type="number"
                required
                autoFocus
                value={clearUserInput}
                onChange={(e) => {
                  setClearUserInput(e.target.value);
                  setClearError(null);
                }}
                placeholder="Sonucu yazın..."
                className="w-full px-3 py-2 text-center font-mono font-bold text-base bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
              />

              {clearError && (
                <p className="text-xs font-bold text-red-600">{clearError}</p>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsClearModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer text-xs"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors cursor-pointer text-xs shadow-md"
                >
                  Evet, Mizanı Sıfırla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Generation Modal */}
      {isInvoiceModalOpen && (
        <MizanInvoiceModal
          stockItems={stockItems}
          mizanCategories={mizanCategories}
          onIssueInvoice={(inv, rows) => {
            if (onIssueInvoice) {
              onIssueInvoice(inv, rows);
            }
          }}
          onClose={() => setIsInvoiceModalOpen(false)}
        />
      )}

      {/* ⚙️ ŞİRKET VE MALİ YIL AYARLARI MODALI */}
      {isCompanyYearSettingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-base">
                <Settings className="w-5 h-5 text-indigo-600" />
                <span>Mizan Ayarları (Şirket & Mali Yıl)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCompanyYearSettingsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* 1. ŞİRKET SEÇİMİ VE YÖNETİMİ */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    1. Şirket / Firma Seçimi
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddCompanyModalOpen(true)}
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Yeni Şirket Ekle</span>
                </button>
              </div>

              <div className="space-y-2">
                {companies.map((comp) => {
                  const isActive = comp === activeCompany;
                  const isEditingThis = editingCompanyOldName === comp;

                  return (
                    <div
                      key={comp}
                      onClick={() => !isEditingThis && onSelectCompany && onSelectCompany(comp)}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                        isActive
                          ? 'bg-indigo-50/90 border-indigo-300 ring-2 ring-indigo-500/20 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {isEditingThis ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (editingCompanyNewName.trim() && onRenameCompany) {
                              onRenameCompany(comp, editingCompanyNewName.trim());
                            }
                            setEditingCompanyOldName(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 w-full"
                        >
                          <input
                            type="text"
                            autoFocus
                            required
                            value={editingCompanyNewName}
                            onChange={(e) => setEditingCompanyNewName(e.target.value)}
                            className="px-2.5 py-1.5 text-xs font-bold border border-indigo-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-900 w-full"
                          />
                          <button
                            type="submit"
                            className="p-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 cursor-pointer shrink-0"
                            title="İsmi Kaydet"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCompanyOldName(null)}
                            className="p-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300 cursor-pointer shrink-0"
                            title="İptal"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isActive
                                  ? 'border-indigo-600 bg-indigo-600 text-white'
                                  : 'border-slate-300'
                              }`}
                            >
                              {isActive && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <span className={`text-xs font-bold ${isActive ? 'text-indigo-950' : 'text-slate-800'}`}>
                              {comp}
                            </span>
                            {isActive && (
                              <span className="text-[10px] font-extrabold bg-indigo-600 text-white px-2 py-0.5 rounded-md">
                                Aktif
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCompanyOldName(comp);
                                setEditingCompanyNewName(comp);
                              }}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="Şirket İsmini Değiştir / Düzenle"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {companies.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`"${comp}" şirketini ve bu şirkete ait tüm verileri silmek istediğinize emin misiniz?`)) {
                                    if (onDeleteCompany) onDeleteCompany(comp);
                                  }
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Şirketi Sil"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. MALİ YIL SEÇİMİ VE YÖNETİMİ */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    2. Mali Yıl Seçimi ({activeCompany})
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddYearModalOpen(true)}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Yeni Yıl Ekle</span>
                </button>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <p className="text-[11px] text-slate-500">
                  Seçilen mali yıl için mizan sıfırdan başlar. İlettiğiniz tarihteki verilere istenildiği an geri dönülebilir.
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  {years.map((yr) => {
                    const isYearActive = activeYear === yr;
                    return (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => onSelectYear && onSelectYear(yr)}
                        className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isYearActive
                            ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400/30'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{yr} Mali Yılı</span>
                        {isYearActive && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 3. DÖNEM DEVİR İŞLEMLERİ */}
            {previousYearItemsCount > 0 && (
              <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-xl space-y-2.5 pt-3">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <RefreshCw className="w-4 h-4 text-amber-600" />
                  <span>Dönem Sonu Bakiye Devir İmkanı</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  {activeYear - 1} mali yılı sonundaki <strong>{previousYearItemsCount} ürünün</strong> kalan stok bakiyesini {activeYear} yılına açılış devir bakiyesi olarak otomatik aktarabilirsiniz.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (onTransferPreviousYearBalances) onTransferPreviousYearBalances();
                    setIsCompanyYearSettingsModalOpen(false);
                  }}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{activeYear - 1} Yılı Bakiyelerini {activeYear} Yılına Devir Et</span>
                </button>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCompanyYearSettingsModalOpen(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
              >
                Tamam / Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yeni Şirket Ekle Modal */}
      {isAddCompanyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-indigo-600 font-bold text-base">
                <Building2 className="w-5 h-5" />
                <span>Yeni Şirket / Firma Ekle</span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCompanyModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newCompanyInput.trim()) return;
                if (onAddCompany) onAddCompany(newCompanyInput.trim());
                setNewCompanyInput('');
                setIsAddCompanyModalOpen(false);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Şirket / Firma Adı:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: ABC Teknoloji Ltd. Şti."
                  value={newCompanyInput}
                  onChange={(e) => setNewCompanyInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Yeni şirket açıldığında o şirkete ait tüm mali yılların mizanı bağımsız tutulur.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCompanyModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  Şirketi Ekle & Seç
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Yeni Mali Yıl Ekle Modal */}
      {isAddYearModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-base">
                <Calendar className="w-5 h-5" />
                <span>Yeni Mali Yıl Ekle</span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddYearModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const yr = Number(newYearInput);
                if (isNaN(yr) || yr < 2000 || yr > 2100) return;
                if (onAddYear) onAddYear(yr);
                setNewYearInput(2027);
                setIsAddYearModalOpen(false);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Eklenecek Mali Yıl (2020 - 2100):
                </label>
                <input
                  type="number"
                  required
                  min={2000}
                  max={2100}
                  value={newYearInput}
                  onChange={(e) => setNewYearInput(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Mizanı {newYearInput} yılına geçirdiğinizde o yıl için mizan sıfırdan başlar ve isteğe bağlı olarak devir bakiyesi aktarabilirsiniz.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddYearModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  Mali Yılı Ekle & Geç
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ⚖️ STOK DÜZELTME & MAHSUP MODALI */}
      {reconcileNegativeItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 space-y-5 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                    <span>Eksi Stok Düzeltme & Mahsup İşlemi</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Eksideki ürünü başka bir mevcuttaki stoktan düşerek bakiyeyi telafi edin ve eksideki kaydı kapatın.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReconcileNegativeItem(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Negative Product Info Box */}
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  Eksiye Düşmüş Olan Ürün (Kapatılacak / Silinecek)
                </span>
                <span className="text-xs font-mono font-black px-2 py-0.5 rounded bg-rose-200 text-rose-900">
                  {formatNumber(reconcileNegativeItem.kalanMiktar, 2)} {reconcileNegativeItem.birim}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">Ürün Adı: </span>
                  <strong className="text-slate-900">{reconcileNegativeItem.urunAdi}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Kategori: </span>
                  <span className="font-semibold text-slate-700">{reconcileNegativeItem.kategori}</span>
                </div>
                <div>
                  <span className="text-slate-500">Giriş / Çıkış: </span>
                  <span className="font-mono text-slate-700">+{formatNumber(reconcileNegativeItem.toplamGiris, 2)} / -{formatNumber(reconcileNegativeItem.toplamCikis, 2)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Eksik Miktar (Açık): </span>
                  <strong className="text-rose-700 font-mono">
                    {formatNumber(Math.abs(reconcileNegativeItem.kalanMiktar), 2)} {reconcileNegativeItem.birim}
                  </strong>
                </div>
              </div>
            </div>

            {/* Target Stock Selection Form */}
            <form onSubmit={handleConfirmReconcile} className="space-y-4 flex flex-col flex-1 min-h-0">
              <div className="space-y-2 flex-1 flex flex-col min-h-0">
                <label className="block text-xs font-bold text-slate-700">
                  Düşülecek Hedef Stoğu Seçin: <span className="text-rose-500">*</span>
                </label>

                {/* Filter and Search Bar for Target Stock */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={reconcileSearchTerm}
                      onChange={(e) => setReconcileSearchTerm(e.target.value)}
                      placeholder="Mevcut stok adı veya kategori ara..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    {reconcileSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setReconcileSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <select
                    value={reconcileSelectedCategory}
                    onChange={(e) => setReconcileSelectedCategory(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-700 focus:outline-none"
                  >
                    <option value="all">Tüm Kategoriler</option>
                    {mizanCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* List of Available Stocks */}
                <div className="border border-slate-200 rounded-xl overflow-y-auto max-h-52 divide-y divide-slate-100 flex-1 bg-white">
                  {stockItems
                    .filter((s) => s.id !== reconcileNegativeItem.id) // Eksideki ürünün kendisi hariç
                    .filter((s) => {
                      if (reconcileSelectedCategory !== 'all' && !turkishEqual(s.kategori, reconcileSelectedCategory)) {
                        return false;
                      }
                      if (reconcileSearchTerm.trim()) {
                        return (
                          turkishIncludes(s.urunAdi, reconcileSearchTerm) ||
                          turkishIncludes(s.kategori, reconcileSearchTerm)
                        );
                      }
                      return true;
                    })
                    .map((s) => {
                      const isSelected = reconcileTargetItemId === s.id;
                      const hasSufficientStock = s.kalanMiktar >= reconcileDeductQuantity;

                      return (
                        <div
                          key={s.id}
                          onClick={() => setReconcileTargetItemId(s.id)}
                          className={`p-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-amber-50/80 border-l-4 border-amber-500'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <input
                              type="radio"
                              name="targetStockItem"
                              checked={isSelected}
                              onChange={() => setReconcileTargetItemId(s.id)}
                              className="text-amber-600 focus:ring-amber-500"
                            />
                            <div className="truncate">
                              <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                                <span>{s.urunAdi}</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-normal">
                                  {s.kategori}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                Ort. Fiyat: {formatCurrency(s.ortalamaBirimFiyat)} | KDV: %{s.kdvOrani ?? 20}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span
                              className={`font-mono font-bold px-2 py-0.5 rounded text-xs inline-block ${
                                s.kalanMiktar > 0
                                  ? hasSufficientStock
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              Mevcut: {formatNumber(s.kalanMiktar, 2)} {s.birim}
                            </span>
                            {isSelected && (
                              <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                                Kalan Sonra: {formatNumber(s.kalanMiktar - reconcileDeductQuantity, 2)} {s.birim}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Deduct Quantity and Note Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Düşülecek Miktar ({reconcileNegativeItem.birim}): <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.0001"
                    required
                    value={reconcileDeductQuantity}
                    onChange={(e) => setReconcileDeductQuantity(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Önerilen açık miktarı: {formatNumber(Math.abs(reconcileNegativeItem.kalanMiktar), 2)}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    İşlem Açıklaması / Belge Notu:
                  </label>
                  <input
                    type="text"
                    value={reconcileNote}
                    onChange={(e) => setReconcileNote(e.target.value)}
                    placeholder="Örn: Stok Düzeltme Mahsubu"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Hareket geçmişine çıkış olarak kaydedilecektir.
                  </span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setReconcileNegativeItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={!reconcileTargetItemId || Number(reconcileDeductQuantity) <= 0}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Düzeltmeyi Onayla & Eksideki Stoğu Kapat</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
