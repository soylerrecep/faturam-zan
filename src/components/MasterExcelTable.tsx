import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Copy,
  Trash2,
  Plus,
  Check,
  CheckCircle2,
  FileText,
  Layers,
  Sparkles,
  ArrowUpDown,
  Tag,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  PackagePlus,
  PackageMinus,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { MasterExcelRow } from '../types';
import {
  exportMasterExcelFile,
  exportMasterExcelRowsToCSV,
  copyMasterExcelRowsToClipboard,
  formatCurrency,
  formatNumber,
} from '../lib/excelExport';
import { turkishIncludes } from '../lib/turkishUtils';

interface MasterExcelTableProps {
  rows: MasterExcelRow[];
  onUpdateRow: (id: string, field: keyof MasterExcelRow, value: any) => void;
  onDeleteRow: (id: string) => void;
  onDeleteMultipleRows?: (ids: string[]) => void;
  onAddRow: () => void;
  onClearAllRows: () => void;
  onAddToMizan: (rows: MasterExcelRow[]) => void;
  onDeductFromMizan: (rows: MasterExcelRow[]) => void;
  mizanCategories?: string[];
}

export const MasterExcelTable: React.FC<MasterExcelTableProps> = ({
  rows,
  onUpdateRow,
  onDeleteRow,
  onDeleteMultipleRows,
  onAddRow,
  onClearAllRows,
  onAddToMizan,
  onDeductFromMizan,
  mizanCategories = [],
}) => {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchSearch =
        searchTerm === '' ||
        turkishIncludes(r.urunAdi, searchTerm) ||
        turkishIncludes(r.kategori, searchTerm) ||
        (r.sourceInvoiceNo && turkishIncludes(r.sourceInvoiceNo, searchTerm));

      const matchCat = filterCategory === 'all' || r.kategori === filterCategory;
      return matchSearch && matchCat;
    });
  }, [rows, searchTerm, filterCategory]);

  // Total pages and paginated slice
  const totalPages = useMemo(() => {
    if (pageSize === -1) return 1;
    return Math.max(1, Math.ceil(filteredRows.length / pageSize));
  }, [filteredRows.length, pageSize]);

  // Auto reset page if out of bounds
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    if (pageSize === -1) return filteredRows;
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safeCurrentPage, pageSize]);

  const isAllSelected = filteredRows.length > 0 && selectedRowIds.length === filteredRows.length;

  const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRowIds(filteredRows.map((r) => r.id));
    } else {
      setSelectedRowIds([]);
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedRowIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleDeleteSelectedRows = () => {
    if (selectedRowIds.length === 0) return;
    if (onDeleteMultipleRows) {
      onDeleteMultipleRows(selectedRowIds);
    } else {
      selectedRowIds.forEach((id) => onDeleteRow(id));
    }
    setSelectedRowIds([]);
  };

  // Calculate summary metrics
  const totalItems = rows.length;
  const totalMiktar = useMemo(() => rows.reduce((s, r) => s + (Number(r.miktar) || 0), 0), [rows]);
  const totalTutar = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.miktar) || 0) * (Number(r.fiyat) || 0), 0),
    [rows]
  );

  const handleExcelExport = () => {
    if (rows.length === 0) return;
    exportMasterExcelFile(rows);
  };

  const handleCSVExport = () => {
    if (rows.length === 0) return;
    exportMasterExcelRowsToCSV(rows);
  };

  const handleCopyClipboard = async () => {
    if (rows.length === 0) return;
    const success = await copyMasterExcelRowsToClipboard(rows);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
      {/* Excel Title Bar (Authentic Excel Green Aesthetic) */}
      <div className="bg-[#107c41] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-white/15 flex items-center justify-center font-bold text-sm shadow-2xs">
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm sm:text-base tracking-tight leading-tight">
                Excel Tablosu (Nihai Aktarım Havuzu)
              </h3>
              <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {rows.length} Satır
              </span>
            </div>
            <p className="text-[11px] text-emerald-100 opacity-90">
              A: Ürün Adı • B: Miktar • C: Birim • D: Fiyat • E: KDV Oranı • F: Kategori
            </p>
          </div>
        </div>

        {/* Action Buttons in Header */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="master-excel-download-btn"
            onClick={handleExcelExport}
            disabled={rows.length === 0}
            className="px-3.5 py-1.5 bg-white hover:bg-emerald-50 text-[#107c41] font-bold text-xs rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="Excel formatında indir (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel Kaydet (.xlsx)</span>
          </button>

          <button
            type="button"
            id="master-copy-clipboard-btn"
            onClick={handleCopyClipboard}
            disabled={rows.length === 0}
            className="px-2.5 py-1.5 bg-black/20 hover:bg-black/30 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 disabled:opacity-40 cursor-pointer"
            title="Panoya Kopyala (Excel'e Ctrl+V ile yapıştır)"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>Kopyalandı</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kopyala</span>
              </>
            )}
          </button>

          {rows.length > 0 && (
            <button
              type="button"
              onClick={onClearAllRows}
              className="p-1.5 text-white/80 hover:text-white hover:bg-red-700/60 rounded-lg transition-colors cursor-pointer"
              title="Excel tablosunu temizle"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Excel Sheet Filter & Toolbar Strip */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Excel tablosunda ürün veya kategori ara..."
            className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#107c41]"
          />

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-white border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#107c41] cursor-pointer"
          >
            <option value="all">Tüm Kategoriler ({rows.length})</option>
            {mizanCategories.map((cat) => {
              const count = rows.filter((r) => r.kategori === cat).length;
              return (
                <option key={cat} value={cat}>
                  {cat} {count > 0 ? `(${count})` : ''}
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {selectedRowIds.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteSelectedRows}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md flex items-center gap-1 text-xs transition-colors cursor-pointer"
              title="Seçili satırları sil"
            >
              <Trash2 className="w-3 h-3" />
              <span>Seçilenleri Sil ({selectedRowIds.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={onAddRow}
            className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold rounded-md flex items-center gap-1 text-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3 text-[#107c41]" />
            + Boş Satır Ekle
          </button>
          <button
            type="button"
            onClick={handleCSVExport}
            disabled={rows.length === 0}
            className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold rounded-md flex items-center gap-1 text-xs transition-colors disabled:opacity-40 cursor-pointer"
          >
            <FileText className="w-3 h-3 text-slate-500" />
            CSV
          </button>
        </div>
      </div>

      {/* Spreadsheet Grid Container */}
      <div className="flex-1 overflow-auto min-h-[300px] max-h-[500px] bg-slate-100/50">
        <table className="w-full border-collapse text-left text-xs">
          {/* Excel Column Letters (A, B, C, D, E, F) */}
          <thead className="sticky top-0 bg-slate-200/90 backdrop-blur-xs text-slate-600 font-bold border-b border-slate-300 z-10 select-none">
            <tr className="divide-x divide-slate-300">
              <th className="w-8 px-2 py-1.5 text-center bg-slate-300/80">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleToggleSelectAll}
                  className="rounded text-[#107c41] focus:ring-[#107c41] cursor-pointer"
                />
              </th>
              <th className="w-10 px-2 py-1.5 text-center bg-slate-300/80 text-[11px] text-slate-500">
                #
              </th>
              <th className="px-3 py-1.5 min-w-[200px]">
                <span className="text-[10px] text-slate-400 block font-mono">SÜTUN A</span>
                Ürün Adı
              </th>
              <th className="w-20 px-2 py-1.5 text-center">
                <span className="text-[10px] text-slate-400 block font-mono">SÜTUN B</span>
                Miktar
              </th>
              <th className="w-20 px-2 py-1.5 text-center">
                <span className="text-[10px] text-slate-400 block font-mono">SÜTUN C</span>
                Birim
              </th>
              <th className="w-28 px-3 py-1.5 text-right">
                <span className="text-[10px] text-slate-400 block font-mono">SÜTUN D</span>
                Fiyat (₺)
              </th>
              <th className="w-24 px-2 py-1.5 text-center">
                <span className="text-[10px] text-slate-400 block font-mono">SÜTUN E</span>
                KDV Oranı (%)
              </th>
              <th className="w-36 px-3 py-1.5">
                <span className="text-[10px] text-slate-400 block font-mono">SÜTUN F</span>
                Kategori
              </th>
              <th className="w-12 px-1 py-1.5 text-center bg-slate-300/80 text-red-600 font-bold">
                Sil
              </th>
            </tr>
          </thead>

          {/* Excel Row Data with Grid Lines */}
          <tbody className="bg-white divide-y divide-slate-200">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-slate-400">
                  <div className="max-w-sm mx-auto flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 text-[#107c41] flex items-center justify-center">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-sm text-slate-700">
                      Excel Tablosu Henüz Boş
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Orta kısımdan faturaları okuyup düzenlemeleri yaptıktan sonra{' '}
                      <strong className="text-[#107c41]">"Aktar"</strong> butonuna basarak ürünleri buraya aktarabilirsiniz.
                    </p>
                  </div>
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                  Filtreye uygun satır bulunamadı.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, idx) => {
                const globalIdx = (safeCurrentPage - 1) * (pageSize === -1 ? 0 : pageSize) + idx;
                const isRowSelected = selectedRowIds.includes(row.id);
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-emerald-50/40 divide-x divide-slate-200 transition-colors group ${
                      isRowSelected ? 'bg-emerald-50/60' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={isRowSelected}
                        onChange={() => handleToggleSelectOne(row.id)}
                        className="rounded text-[#107c41] focus:ring-[#107c41] cursor-pointer"
                      />
                    </td>

                    {/* Row Index Number (1, 2, 3...) */}
                    <td className="px-2 py-1 text-center font-mono text-[11px] text-slate-400 bg-slate-50 select-none group-hover:text-slate-600">
                      {globalIdx + 1}
                    </td>

                    {/* Sütun A: Ürün Adı */}
                    <td className="p-0">
                      <input
                        type="text"
                        value={row.urunAdi}
                        onChange={(e) => onUpdateRow(row.id, 'urunAdi', e.target.value)}
                        placeholder="Ürün adı girin..."
                        className="w-full px-3 py-1.5 bg-transparent border-none focus:ring-1 focus:ring-[#107c41] text-xs font-medium text-slate-800"
                      />
                    </td>

                    {/* Sütun B: Miktar */}
                    <td className="p-0 text-center">
                      <input
                        type="number"
                        step="any"
                        value={row.miktar}
                        onChange={(e) =>
                          onUpdateRow(row.id, 'miktar', Number(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1.5 text-center font-mono font-medium text-xs bg-transparent border-none focus:ring-1 focus:ring-[#107c41] text-slate-800"
                      />
                    </td>

                    {/* Sütun C: Birim */}
                    <td className="p-0 text-center">
                      <input
                        type="text"
                        value={row.birim || 'Adet'}
                        onChange={(e) => onUpdateRow(row.id, 'birim', e.target.value)}
                        className="w-full px-2 py-1.5 text-center italic text-xs bg-transparent border-none focus:ring-1 focus:ring-[#107c41] text-slate-600"
                      />
                    </td>

                    {/* Sütun D: Fiyat */}
                    <td className="p-0 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={row.fiyat}
                        onChange={(e) =>
                          onUpdateRow(row.id, 'fiyat', Number(e.target.value) || 0)
                        }
                        className="w-full px-3 py-1.5 text-right font-mono font-medium text-xs bg-transparent border-none focus:ring-1 focus:ring-[#107c41] text-slate-800"
                      />
                    </td>

                    {/* Sütun E: KDV Oranı (%) */}
                    <td className="p-0 text-center">
                      <select
                        value={row.kdvOrani}
                        onChange={(e) =>
                          onUpdateRow(row.id, 'kdvOrani', Number(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1.5 text-center text-xs bg-transparent border-none focus:ring-1 focus:ring-[#107c41] text-slate-700 cursor-pointer"
                      >
                        <option value="0">%0</option>
                        <option value="1">%1</option>
                        <option value="10">%10</option>
                        <option value="20">%20</option>
                      </select>
                    </td>

                    {/* Sütun F: Kategori (Sadece Mizan'daki Kategoriler) */}
                    <td className="p-0 relative group/cell">
                      <div className="flex items-center">
                        <select
                          value={
                            mizanCategories.includes(row.kategori || '')
                              ? row.kategori
                              : mizanCategories[0] || 'Genel Gider'
                          }
                          onChange={(e) => onUpdateRow(row.id, 'kategori', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-transparent border-none focus:ring-1 focus:ring-[#107c41] text-slate-800 font-medium cursor-pointer"
                          title="Mizan Kategorisi"
                        >
                          {mizanCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const catToCopy = row.kategori || mizanCategories[0];
                            rows.forEach((r) => {
                              const currentGlobalIdx = rows.findIndex((item) => item.id === row.id);
                              const targetGlobalIdx = rows.findIndex((item) => item.id === r.id);
                              if (targetGlobalIdx >= currentGlobalIdx) {
                                onUpdateRow(r.id, 'kategori', catToCopy);
                              }
                            });
                          }}
                          className="opacity-0 group-hover/cell:opacity-100 px-1 text-slate-400 hover:text-[#107c41] transition-opacity cursor-pointer shrink-0 font-bold"
                          title="Bu kategoriyi alttaki tüm satırlara uygula (Excel Aşağı Doldur)"
                        >
                          ↓
                        </button>
                      </div>
                    </td>

                    {/* Delete Action */}
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRow(row.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center"
                        title="Bu satırı Excel tablosundan sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Excel Live Formula / Summary Footer */}
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 bg-slate-100 border-t-2 border-slate-300 font-semibold text-xs text-slate-700 divide-x divide-slate-300 z-10 shadow-sm">
              <tr>
                <td className="px-2 py-2 text-center bg-slate-200"></td>
                <td className="px-2 py-2 text-center font-mono bg-slate-200 text-slate-500 font-bold">
                  ∑
                </td>
                <td className="px-3 py-2 font-bold text-slate-900">
                  TOPLAM ({totalItems} Kalem)
                </td>
                <td className="px-2 py-2 text-center font-mono font-bold text-slate-900">
                  {formatNumber(totalMiktar, 2)}
                </td>
                <td className="px-2 py-2 text-center text-slate-400">-</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-[#107c41] text-sm">
                  {formatCurrency(totalTutar)}
                </td>
                <td className="px-2 py-2 text-center text-slate-400">-</td>
                <td className="px-3 py-2 text-slate-500 font-normal">
                  {Array.from(new Set(rows.map((r) => r.kategori))).length} Kategori
                </td>
                <td className="px-1 py-2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination Controls Bar */}
      {filteredRows.length > 0 && (
        <div className="bg-slate-50 border-t border-slate-200 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 shrink-0">
          <div className="flex items-center gap-2">
            <span>
              {pageSize === -1 ? (
                <>Toplam <strong>{filteredRows.length}</strong> satır gösteriliyor</>
              ) : (
                <>
                  Gösterilen: <strong>{(safeCurrentPage - 1) * pageSize + 1} - {Math.min(safeCurrentPage * pageSize, filteredRows.length)}</strong> / Toplam <strong>{filteredRows.length}</strong> satır
                </>
              )}
            </span>
            <div className="flex items-center gap-1 ml-2">
              <span className="text-[11px] text-slate-400">Sayfa Başı:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
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

          {pageSize !== -1 && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage === 1}
                className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="İlk Sayfa"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Önceki Sayfa"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 py-0.5 font-semibold text-slate-700 font-mono">
                {safeCurrentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Sonraki Sayfa"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage === totalPages}
                className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Son Sayfa"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* MİZANA STOK EKLE & STOK DÜŞÜR ACTION BAR (Underneath Right Excel Section) */}
      <div className="bg-slate-50 border-t border-slate-200 p-3 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span className="font-semibold text-slate-700 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            Mizan Stok Hareketleri:
          </span>
          <span>
            {totalItems} Kalem • Toplam: <strong className="text-slate-800 font-mono">{formatCurrency(totalTutar)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* MİZANA STOK EKLE BUTTON */}
          <button
            type="button"
            id="btn-mizana-stok-ekle"
            onClick={() => onAddToMizan(rows)}
            disabled={rows.length === 0}
            className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer group"
            title="Sağdaki Excel tablosundaki ürünleri Mizana Giriş (Stok Ekle) olarak kaydet"
          >
            <PackagePlus className="w-4 h-4 text-emerald-200 group-hover:scale-110 transition-transform" />
            <span>Mizana Stok Ekle (+)</span>
          </button>

          {/* MİZANA STOK DÜŞÜR BUTTON */}
          <button
            type="button"
            id="btn-mizana-stok-dusur"
            onClick={() => onDeductFromMizan(rows)}
            disabled={rows.length === 0}
            className="py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer group"
            title="Sağdaki Excel tablosundaki ürünleri Mizandan Çıkış (Stok Düşür) olarak kaydet"
          >
            <PackageMinus className="w-4 h-4 text-amber-200 group-hover:scale-110 transition-transform" />
            <span>Mizana Stok Düşür (-)</span>
          </button>
        </div>

        {/* Quick Excel Download link */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
          <button
            type="button"
            onClick={handleExcelExport}
            disabled={rows.length === 0}
            className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 hover:underline cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            Excel Dosyası Olarak İndir (.xlsx)
          </button>
          <span className="text-slate-400 font-mono">A:Ürün B:Miktar C:Birim D:Fiyat E:KDV F:Kategori</span>
        </div>
      </div>
    </div>
  );
};
