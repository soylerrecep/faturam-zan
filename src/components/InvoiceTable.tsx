import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Trash2,
  Copy,
  ArrowUpDown,
  Filter,
  Download,
  Percent,
} from 'lucide-react';
import { ProcessedInvoice, InvoiceItem } from '../types';
import { formatCurrency, formatNumber } from '../lib/excelExport';
import { turkishIncludes, toTurkishLower } from '../lib/turkishUtils';

interface InvoiceTableProps {
  invoices: ProcessedInvoice[];
  activeInvoiceId: string | 'all';
  onUpdateItem: (invoiceId: string, itemId: string, field: keyof InvoiceItem, value: any) => void;
  onAddItem: (invoiceId: string) => void;
  onDeleteItem: (invoiceId: string, itemId: string) => void;
  onDuplicateItem: (invoiceId: string, item: InvoiceItem) => void;
  onDeleteInvoice: (invoiceId: string) => void;
  onBatchUpdateVat: (vatRate: number, selectedIds: string[]) => void;
  onBatchDelete: (selectedIds: string[]) => void;
  onExportSelectedToExcel: (selectedIds: string[]) => void;
}

const COMMON_UNITS = [
  'Adet',
  'Kg',
  'Gram',
  'Litre',
  'Metre',
  'Paket',
  'Koli',
  'Kutu',
  'Ton',
  'm²',
  'm³',
  'Saat',
  'Gün',
  'Ay',
  'Yıl',
  'Plaka',
  'Rulo',
  'Takım',
  'Çift',
];

export const InvoiceTable: React.FC<InvoiceTableProps> = ({
  invoices,
  activeInvoiceId,
  onUpdateItem,
  onAddItem,
  onDeleteItem,
  onDuplicateItem,
  onDeleteInvoice,
  onBatchUpdateVat,
  onBatchDelete,
  onExportSelectedToExcel,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [sortField, setSortField] = useState<keyof InvoiceItem | 'faturaNo'>('siraNo');
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // Flatten items for active view with parent invoice info
  const itemsWithInvoice = useMemo(() => {
    const list: { item: InvoiceItem; invoice: ProcessedInvoice }[] = [];

    const targetInvoices =
      activeInvoiceId === 'all'
        ? invoices
        : invoices.filter((inv) => inv.id === activeInvoiceId);

    targetInvoices.forEach((inv) => {
      inv.items.forEach((item) => {
        list.push({ item, invoice: inv });
      });
    });

    return list;
  }, [invoices, activeInvoiceId]);

  // Available unique units for filter dropdown
  const availableUnits = useMemo(() => {
    const set = new Set<string>();
    itemsWithInvoice.forEach(({ item }) => {
      if (item.birim) set.add(item.birim);
    });
    return Array.from(set);
  }, [itemsWithInvoice]);

  // Filtered and Sorted list
  const filteredAndSortedItems = useMemo(() => {
    let result = itemsWithInvoice.filter(({ item, invoice }) => {
      const matchSearch =
        searchTerm === '' ||
        turkishIncludes(item.urunHizmetAdi, searchTerm) ||
        (item.urunKodu && turkishIncludes(item.urunKodu, searchTerm)) ||
        (item.aciklama && turkishIncludes(item.aciklama, searchTerm)) ||
        (invoice.metadata.faturaNo &&
          turkishIncludes(invoice.metadata.faturaNo, searchTerm)) ||
        (invoice.metadata.saticiUnvan &&
          turkishIncludes(invoice.metadata.saticiUnvan, searchTerm));

      const matchUnit = unitFilter === 'all' || item.birim === unitFilter;

      return matchSearch && matchUnit;
    });

    result.sort((a, b) => {
      let valA: any =
        sortField === 'faturaNo' ? a.invoice.metadata.faturaNo : a.item[sortField];
      let valB: any =
        sortField === 'faturaNo' ? b.invoice.metadata.faturaNo : b.item[sortField];

      if (typeof valA === 'string' && typeof valB === 'string') {
        const comp = valA.localeCompare(valB, 'tr-TR', { sensitivity: 'base' });
        return sortAsc ? comp : -comp;
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    return result;
  }, [itemsWithInvoice, searchTerm, unitFilter, sortField, sortAsc]);

  // Financial summary for currently visible filtered items
  const summary = useMemo(() => {
    let totalQty = 0;
    let totalMatrah = 0;
    let totalVat = 0;
    let totalGrand = 0;

    filteredAndSortedItems.forEach(({ item }) => {
      const qty = Number(item.miktar) || 0;
      const total = Number(item.satirToplami) || 0;
      const vat = Number(item.kdvTutari) || 0;

      totalQty += qty;
      totalMatrah += total;
      totalVat += vat;
      totalGrand += total + vat;
    });

    return { totalQty, totalMatrah, totalVat, totalGrand };
  }, [filteredAndSortedItems]);

  const handleSort = (field: keyof InvoiceItem | 'faturaNo') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedItemIds(filteredAndSortedItems.map((x) => x.item.id));
    } else {
      setSelectedItemIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Helper for auto-calculating values when unit price, quantity, discount or VAT changes
  const handleItemFieldChange = (
    invoiceId: string,
    item: InvoiceItem,
    field: keyof InvoiceItem,
    rawValue: any
  ) => {
    let value = rawValue;

    if (
      field === 'miktar' ||
      field === 'birimFiyat' ||
      field === 'iskontoOrani' ||
      field === 'kdvOrani' ||
      field === 'satirToplami' ||
      field === 'kdvTutari'
    ) {
      value = Number(rawValue) || 0;
    }

    onUpdateItem(invoiceId, item.id, field, value);

    // Dynamic auto-recalculation
    const miktar = field === 'miktar' ? Number(value) : Number(item.miktar) || 0;
    const birimFiyat = field === 'birimFiyat' ? Number(value) : Number(item.birimFiyat) || 0;
    const iskontoOrani =
      field === 'iskontoOrani' ? Number(value) : Number(item.iskontoOrani) || 0;
    const kdvOrani = field === 'kdvOrani' ? Number(value) : Number(item.kdvOrani) || 0;

    if (
      field === 'miktar' ||
      field === 'birimFiyat' ||
      field === 'iskontoOrani' ||
      field === 'kdvOrani'
    ) {
      const brutTutar = miktar * birimFiyat;
      const iskontoTutari = (brutTutar * iskontoOrani) / 100;
      const netSatirToplami = brutTutar - iskontoTutari;
      const kdvTutari = (netSatirToplami * kdvOrani) / 100;

      onUpdateItem(invoiceId, item.id, 'iskontoTutari', iskontoTutari);
      onUpdateItem(invoiceId, item.id, 'satirToplami', netSatirToplami);
      onUpdateItem(invoiceId, item.id, 'kdvTutari', kdvTutari);
    }
  };

  const isAllSelected =
    filteredAndSortedItems.length > 0 &&
    selectedItemIds.length === filteredAndSortedItems.length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
      {/* Bento Grid Header Toolbar */}
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-slate-800 text-base">Çıkarılan Kalemler</h3>
          <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-0.5 rounded-full border border-indigo-100">
            {filteredAndSortedItems.length} Kalem
          </span>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center flex-wrap gap-2.5 flex-1 max-w-xl justify-end">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="bento-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ürün adı, kod veya fatura no ara..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">Tüm Birimler ({availableUnits.length})</option>
              {availableUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {selectedItemIds.length > 0 ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onExportSelectedToExcel(selectedItemIds)}
                className="text-xs font-semibold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3" />
                Seçilenleri İndir ({selectedItemIds.length})
              </button>
              <button
                onClick={() => onBatchDelete(selectedItemIds)}
                className="text-xs font-semibold px-2.5 py-1.5 border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Sil
              </button>
            </div>
          ) : (
            <button
              id="bento-add-row-btn"
              onClick={() => onAddItem(activeInvoiceId === 'all' ? (invoices[0]?.id || '') : activeInvoiceId)}
              className="text-xs font-semibold px-3 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              + Satır Ekle
            </button>
          )}
        </div>
      </div>

      {/* Bento Grid Data Table */}
      <div className="flex-1 overflow-x-auto min-h-[300px] max-h-[560px]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-white shadow-2xs z-10">
            <tr className="text-xs uppercase text-slate-400 font-bold border-b border-slate-100">
              <th className="px-4 py-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </th>
              <th
                onClick={() => handleSort('siraNo')}
                className="px-4 py-3 w-14 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap"
              >
                <div className="flex items-center gap-1">
                  <span>#</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>

              {activeInvoiceId === 'all' && (
                <th
                  onClick={() => handleSort('faturaNo')}
                  className="px-4 py-3 w-32 cursor-pointer hover:text-slate-600 select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>Fatura No</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
              )}

              <th
                onClick={() => handleSort('urunHizmetAdi')}
                className="px-6 py-3 min-w-[220px] cursor-pointer hover:text-slate-600 select-none"
              >
                <div className="flex items-center gap-1">
                  <span>Mal / Hizmet Tanımı</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60" />
                </div>
              </th>

              <th className="px-4 py-3 w-24 text-center whitespace-nowrap">Miktar</th>
              <th className="px-4 py-3 w-24 text-center whitespace-nowrap">Birim</th>
              <th className="px-4 py-3 w-28 text-right whitespace-nowrap">Birim Fiyat</th>
              <th className="px-4 py-3 w-20 text-right whitespace-nowrap">KDV %</th>
              <th className="px-6 py-3 w-32 text-right whitespace-nowrap">Toplam</th>
              <th className="px-4 py-3 w-16 text-center whitespace-nowrap">İşlem</th>
            </tr>
          </thead>

          <tbody className="text-sm divide-y divide-slate-50">
            {filteredAndSortedItems.length === 0 ? (
              <tr>
                <td
                  colSpan={activeInvoiceId === 'all' ? 10 : 9}
                  className="px-6 py-12 text-center text-slate-400"
                >
                  <p className="font-medium text-sm">Ürün veya hizmet kalemi bulunamadı.</p>
                  <p className="text-xs mt-1">Arama filtresini temizleyebilir veya yeni satır ekleyebilirsiniz.</p>
                </td>
              </tr>
            ) : (
              filteredAndSortedItems.map(({ item, invoice }, index) => {
                const isSelected = selectedItemIds.includes(item.id);

                return (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-50 hover:bg-indigo-50/30 transition-colors ${
                      isSelected ? 'bg-indigo-50/40' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>

                    {/* Sıra No */}
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                      {String(item.siraNo || index + 1).padStart(2, '0')}
                    </td>

                    {/* Fatura No (if 'all' view) */}
                    {activeInvoiceId === 'all' && (
                      <td className="px-4 py-3 text-xs text-slate-600 font-medium truncate max-w-[130px]" title={invoice.metadata.faturaNo}>
                        {invoice.metadata.faturaNo || invoice.fileName}
                      </td>
                    )}

                    {/* Mal / Hizmet Tanımı (Inline Editable) */}
                    <td className="px-6 py-3">
                      <input
                        type="text"
                        value={item.urunHizmetAdi}
                        onChange={(e) =>
                          onUpdateItem(invoice.id, item.id, 'urunHizmetAdi', e.target.value)
                        }
                        placeholder="Mal veya Hizmet Tanımı"
                        className="w-full bg-transparent border-none focus:ring-1 focus:ring-indigo-500 font-medium text-slate-800 text-sm rounded px-1.5 py-0.5"
                      />
                      {item.urunKodu && (
                        <span className="text-[11px] text-slate-400 font-mono block px-1.5 mt-0.5">
                          Kod: {item.urunKodu}
                        </span>
                      )}
                    </td>

                    {/* Miktar (Inline Editable) */}
                    <td className="px-4 py-3 text-center font-mono">
                      <input
                        type="number"
                        step="any"
                        value={item.miktar}
                        onChange={(e) =>
                          handleItemFieldChange(invoice.id, item, 'miktar', e.target.value)
                        }
                        className="w-16 text-center bg-transparent border-none focus:ring-1 focus:ring-indigo-500 font-mono font-medium text-slate-800 text-sm rounded px-1 py-0.5"
                      />
                    </td>

                    {/* Birim (Inline Editable) */}
                    <td className="px-4 py-3 text-center text-slate-500 italic text-sm">
                      <input
                        type="text"
                        list={`bento-units-${item.id}`}
                        value={item.birim || 'Adet'}
                        onChange={(e) =>
                          onUpdateItem(invoice.id, item.id, 'birim', e.target.value)
                        }
                        className="w-18 text-center bg-transparent border-none focus:ring-1 focus:ring-indigo-500 text-slate-600 italic text-sm rounded px-1 py-0.5"
                      />
                      <datalist id={`bento-units-${item.id}`}>
                        {COMMON_UNITS.map((u) => (
                          <option key={u} value={u} />
                        ))}
                      </datalist>
                    </td>

                    {/* Birim Fiyat (Inline Editable) */}
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-700">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={item.birimFiyat}
                          onChange={(e) =>
                            handleItemFieldChange(invoice.id, item, 'birimFiyat', e.target.value)
                          }
                          className="w-24 text-right bg-transparent border-none focus:ring-1 focus:ring-indigo-500 font-mono font-medium text-slate-800 text-sm rounded px-1 py-0.5"
                        />
                        <span className="text-xs text-slate-400 font-normal">
                          {item.paraBirimi || invoice.metadata.paraBirimi || 'TL'}
                        </span>
                      </div>
                    </td>

                    {/* KDV % */}
                    <td className="px-4 py-3 text-right">
                      <select
                        value={item.kdvOrani ?? 20}
                        onChange={(e) =>
                          handleItemFieldChange(invoice.id, item, 'kdvOrani', e.target.value)
                        }
                        className="text-xs bg-transparent border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="0">%0</option>
                        <option value="1">%1</option>
                        <option value="10">%10</option>
                        <option value="20">%20</option>
                      </select>
                    </td>

                    {/* Toplam Satır Tutarı */}
                    <td className="px-6 py-3 text-right font-mono font-bold text-indigo-600 text-sm whitespace-nowrap">
                      {formatCurrency(item.satirToplami, item.paraBirimi || invoice.metadata.paraBirimi)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 text-slate-400">
                        <button
                          onClick={() => onDuplicateItem(invoice.id, item)}
                          className="p-1 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          title="Satırı kopyala"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteItem(invoice.id, item.id)}
                          className="p-1 hover:text-red-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          title="Satırı sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Dynamic Bento Table Footer */}
          <tfoot className="bg-slate-50 border-t border-slate-200 text-slate-700 font-semibold text-xs sticky bottom-0 z-10">
            <tr>
              <td className="px-4 py-3 text-center text-slate-400 font-mono">∑</td>
              <td className="px-4 py-3 text-slate-500 font-normal">
                {filteredAndSortedItems.length} Kalem
              </td>
              {activeInvoiceId === 'all' && <td className="px-4 py-3"></td>}
              <td className="px-6 py-3 font-bold text-slate-800">
                Filtrelenen Toplam
              </td>
              <td className="px-4 py-3 text-center font-mono font-bold text-slate-800">
                {formatNumber(summary.totalQty, 2)}
              </td>
              <td className="px-4 py-3 text-center text-slate-400">Toplam</td>
              <td className="px-4 py-3 text-right font-mono text-slate-600">
                KDV: {formatCurrency(summary.totalVat)}
              </td>
              <td className="px-4 py-3"></td>
              <td className="px-6 py-3 text-right font-mono font-bold text-indigo-600 text-base">
                {formatCurrency(summary.totalMatrah)}
              </td>
              <td className="px-4 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
