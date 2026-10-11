import * as XLSX from 'xlsx';
import { ProcessedInvoice, InvoiceItem, MasterExcelRow } from '../types';

export interface ExportOptions {
  includeMetadataSheet?: boolean;
  selectedOnly?: boolean;
  selectedItemIds?: string[];
  filename?: string;
}

export function formatCurrency(value: number, currency: string = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currency === 'TL' ? 'TRY' : (currency || 'TRY'),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value || 0);
}

/**
 * Kullanıcının istediği 6 sütunlu (A: Ürün Adı, B: Miktar, C: Birim, D: Fiyat, E: KDV Oranı, F: Kategori)
 * Nihai Master Excel dosyasını (.xlsx) oluşturur ve indirir.
 */
export function exportMasterExcelFile(
  rows: MasterExcelRow[],
  customFilename?: string
): void {
  const wb = XLSX.utils.book_new();

  // Exact 6 columns matching user requirement
  const excelData = rows.map((row) => ({
    'Ürün Adı': row.urunAdi,
    'Miktar': Number(row.miktar) || 0,
    'Birim': row.birim || 'Adet',
    'Fiyat': Number(row.fiyat) || 0,
    'KDV Oranı (%)': Number(row.kdvOrani) || 0,
    'Kategori': row.kategori || 'Diğer',
  }));

  const ws = XLSX.utils.json_to_sheet(excelData);

  // Column width configurations (A, B, C, D, E, F)
  ws['!cols'] = [
    { wch: 42 }, // A: Ürün Adı
    { wch: 12 }, // B: Miktar
    { wch: 12 }, // C: Birim
    { wch: 16 }, // D: Fiyat
    { wch: 16 }, // E: KDV Oranı (%)
    { wch: 22 }, // F: Kategori
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Ürün ve Fiyat Listesi');

  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = customFilename
    ? `${customFilename.replace(/\.xlsx$/i, '')}.xlsx`
    : `Urun_ve_Fiyat_Listesi_${dateStr}.xlsx`;

  XLSX.writeFile(wb, fileName);
}

/**
 * Sağ taraftaki Master Excel tablosunu CSV olarak indirir.
 */
export function exportMasterExcelRowsToCSV(
  rows: MasterExcelRow[],
  customFilename?: string
): void {
  const headers = ['Ürün Adı', 'Miktar', 'Birim', 'Fiyat', 'KDV Oranı (%)', 'Kategori'];
  const csvRows: string[][] = [headers];

  rows.forEach((r) => {
    csvRows.push([
      `"${(r.urunAdi || '').replace(/"/g, '""')}"`,
      `${r.miktar}`,
      `"${(r.birim || '').replace(/"/g, '""')}"`,
      `${r.fiyat}`,
      `${r.kdvOrani}`,
      `"${(r.kategori || '').replace(/"/g, '""')}"`,
    ]);
  });

  const csvContent = '\uFEFF' + csvRows.map((r) => r.join(';')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    customFilename || `Urun_ve_Fiyat_Listesi_${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Sağ taraftaki Excel tablosunu panoya kopyalar (Ctrl+V ile Excel veya Google Sheets'e yapıştırılabilir).
 */
export async function copyMasterExcelRowsToClipboard(rows: MasterExcelRow[]): Promise<boolean> {
  try {
    const headers = ['Ürün Adı', 'Miktar', 'Birim', 'Fiyat', 'KDV Oranı (%)', 'Kategori'];
    const lines = [headers.join('\t')];

    rows.forEach((r) => {
      lines.push(
        [r.urunAdi, r.miktar, r.birim, r.fiyat, r.kdvOrani, r.kategori].join('\t')
      );
    });

    await navigator.clipboard.writeText(lines.join('\n'));
    return true;
  } catch (err) {
    console.error('Clipboard copy error:', err);
    return false;
  }
}

/**
 * Genel fatura dışa aktarma (tüm alanlar)
 */
export function exportInvoicesToExcel(
  invoices: ProcessedInvoice[],
  options: ExportOptions = {}
): void {
  const wb = XLSX.utils.book_new();

  const lineItemsData: any[] = [];
  invoices.forEach((inv) => {
    const itemsToExport = options.selectedOnly && options.selectedItemIds
      ? inv.items.filter((item) => options.selectedItemIds!.includes(item.id))
      : inv.items;

    itemsToExport.forEach((item) => {
      lineItemsData.push({
        'Ürün Adı (A)': item.urunHizmetAdi,
        'Miktar (B)': Number(item.miktar) || 0,
        'Birim (C)': item.birim || 'Adet',
        'Fiyat (D)': Number(item.birimFiyat) || 0,
        'KDV Oranı % (E)': Number(item.kdvOrani) || 0,
        'Kategori (F)': item.kategori || 'Diğer',
        'Fatura No': inv.metadata.faturaNo || '-',
        'Fatura Tarihi': inv.metadata.faturaTarihi || '-',
        'Satıcı Firma': inv.metadata.saticiUnvan || '-',
        'KDV Tutarı': Number(item.kdvTutari) || 0,
        'Satır Toplam Tutarı': Number(item.satirToplami) || 0,
      });
    });
  });

  const wsItems = XLSX.utils.json_to_sheet(lineItemsData);
  wsItems['!cols'] = [
    { wch: 38 }, // Ürün Adı
    { wch: 10 }, // Miktar
    { wch: 10 }, // Birim
    { wch: 14 }, // Fiyat
    { wch: 12 }, // KDV
    { wch: 18 }, // Kategori
    { wch: 18 }, // Fatura No
    { wch: 14 }, // Tarih
    { wch: 25 }, // Satıcı
    { wch: 14 }, // KDV Tutar
    { wch: 16 }, // Toplam
  ];

  XLSX.utils.book_append_sheet(wb, wsItems, 'Ürün Kalemleri');
  XLSX.writeFile(wb, options.filename || `Fatura_Urunleri_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportInvoicesToCSV(
  invoices: ProcessedInvoice[],
  options: ExportOptions = {}
): void {
  const headers = ['Ürün Adı', 'Miktar', 'Birim', 'Fiyat', 'KDV Oranı (%)', 'Kategori', 'Fatura No'];
  const rows: string[][] = [headers];

  invoices.forEach((inv) => {
    const itemsToExport = options.selectedOnly && options.selectedItemIds
      ? inv.items.filter((item) => options.selectedItemIds!.includes(item.id))
      : inv.items;

    itemsToExport.forEach((item) => {
      rows.push([
        `"${(item.urunHizmetAdi || '').replace(/"/g, '""')}"`,
        `${item.miktar}`,
        `"${(item.birim || '').replace(/"/g, '""')}"`,
        `${item.birimFiyat}`,
        `${item.kdvOrani || 0}`,
        `"${(item.kategori || 'Diğer').replace(/"/g, '""')}"`,
        `"${(inv.metadata.faturaNo || '').replace(/"/g, '""')}"`,
      ]);
    });
  });

  const csvContent = '\uFEFF' + rows.map((r) => r.join(';')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Fatura_Urunleri_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function copyItemsToClipboard(items: InvoiceItem[]): Promise<boolean> {
  try {
    const headers = ['Ürün Adı', 'Miktar', 'Birim', 'Fiyat', 'KDV Oranı (%)', 'Kategori'];
    const lines = [headers.join('\t')];

    items.forEach((item) => {
      lines.push(
        [
          item.urunHizmetAdi,
          item.miktar,
          item.birim,
          item.birimFiyat,
          item.kdvOrani,
          item.kategori || 'Diğer',
        ].join('\t')
      );
    });

    await navigator.clipboard.writeText(lines.join('\n'));
    return true;
  } catch (err) {
    console.error('Clipboard copy error:', err);
    return false;
  }
}

/**
 * Mizan ve stok yükleme için taslak Excel şablonunu oluşturur ve indirir (.xlsx)
 */
export function exportStockTemplateExcel(): void {
  const wb = XLSX.utils.book_new();

  const templateData = [
    {
      'Kategori': 'Genel Gider',
      'Ürün Adı': 'Fotokopi Kağıdı A4 (Örnek)',
      'Miktar': 10,
      'Birim': 'Paket',
      'Fiyat': 150.00,
      'KDV Oranı (%)': 20,
      'İşlem Tipi (Giriş/Çıkış)': 'Giriş',
    },
    {
      'Kategori': 'Temizlik Malzemeleri',
      'Ürün Adı': 'Yüzey Temizleyici 5L (Örnek)',
      'Miktar': 5,
      'Birim': 'Adet',
      'Fiyat': 240.00,
      'KDV Oranı (%)': 20,
      'İşlem Tipi (Giriş/Çıkış)': 'Giriş',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(templateData);

  ws['!cols'] = [
    { wch: 22 }, // Kategori
    { wch: 35 }, // Ürün Adı
    { wch: 12 }, // Miktar
    { wch: 12 }, // Birim
    { wch: 14 }, // Fiyat
    { wch: 16 }, // KDV Oranı (%)
    { wch: 22 }, // İşlem Tipi
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Mizan Stok Taslak');
  XLSX.writeFile(wb, 'Mizan_Stok_Yukleme_Taslagi.xlsx');
}
