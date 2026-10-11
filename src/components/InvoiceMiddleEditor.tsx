import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Copy,
  ArrowRight,
  CheckCircle2,
  Building2,
  Calendar,
  Layers,
  Sparkles,
  ArrowUpDown,
  Tag,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Eye,
  EyeOff,
  Columns,
} from 'lucide-react';
import { ProcessedInvoice, InvoiceItem } from '../types';
import { formatCurrency, formatNumber } from '../lib/excelExport';
import { InvoiceDocumentViewer } from './InvoiceDocumentViewer';

interface InvoiceMiddleEditorProps {
  invoice?: ProcessedInvoice;
  allInvoices?: ProcessedInvoice[];
  invoiceIndex: number;
  totalInvoices: number;
  onUpdateItem: (invoiceId: string, itemId: string, field: keyof InvoiceItem, value: any) => void;
  onAddItem: (invoiceId: string) => void;
  onDeleteItem: (invoiceId: string, itemId: string) => void;
  onDeleteMultipleItems?: (invoiceId: string, itemIds: string[]) => void;
  onDuplicateItem: (invoiceId: string, item: InvoiceItem) => void;
  onTransferItemsToExcel: (items: InvoiceItem[], invoice: ProcessedInvoice) => void;
  onNextInvoice?: () => void;
  onPrevInvoice?: () => void;
  mizanCategories?: string[];
  onSwitchToMizan?: () => void;
  isSplitView?: boolean;
  onToggleSplitView?: () => void;
  onAttachDocument?: (invoiceId: string, dataUrl: string, fileType: string) => void;
}

const COMMON_UNITS = [
  'Adet',
  'Kg',
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
  'Plaka',
  'Rulo',
  'Takım',
];

export const InvoiceMiddleEditor: React.FC<InvoiceMiddleEditorProps> = ({
  invoice,
  allInvoices = [],
  invoiceIndex,
  totalInvoices,
  onUpdateItem,
  onAddItem,
  onDeleteItem,
  onDeleteMultipleItems,
  onDuplicateItem,
  onTransferItemsToExcel,
  onNextInvoice,
  onPrevInvoice,
  mizanCategories = [],
  onSwitchToMizan,
  isSplitView = false,
  onToggleSplitView,
  onAttachDocument,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [justTransferred, setJustTransferred] = useState(false);
  const [showLocalDocViewer, setShowLocalDocViewer] = useState(false);

  if (!invoice) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center h-full">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-slate-700 text-base">Fatura Seçilmedi</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Sol taraftaki listeden bir fatura seçerek ürünlerini inceleyebilir, düzenleyebilir ve sağdaki Excel tablosuna aktarabilirsiniz.
        </p>
      </div>
    );
  }

  const items = invoice.items;
  const isAllSelected = items.length > 0 && selectedIds.length === items.length;

  const duplicateInvoice = allInvoices.find((other) => {
    if (other.id === invoice.id) return false;
    const f1 = (invoice.metadata.faturaNo || '').trim().toLowerCase();
    const f2 = (other.metadata.faturaNo || '').trim().toLowerCase();
    const e1 = (invoice.metadata.ettn || '').trim().toLowerCase();
    const e2 = (other.metadata.ettn || '').trim().toLowerCase();
    if (f1 && f2 && f1 === f2 && !f1.startsWith('fat-')) return true;
    if (e1 && e2 && e1 === e2) return true;
    return false;
  });

  const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(items.map((it) => it.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Transfer all items of this invoice to Right Master Excel table
  const handleTransferAll = () => {
    if (items.length === 0) return;
    onTransferItemsToExcel(items, invoice);
    setJustTransferred(true);
    setTimeout(() => setJustTransferred(false), 2200);
  };

  // Transfer selected items of this invoice
  const handleTransferSelected = () => {
    const selectedItems = items.filter((it) => selectedIds.includes(it.id));
    if (selectedItems.length === 0) return;
    onTransferItemsToExcel(selectedItems, invoice);
    setSelectedIds([]);
    setJustTransferred(true);
    setTimeout(() => setJustTransferred(false), 2200);
  };

  // Delete selected items
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    if (onDeleteMultipleItems) {
      onDeleteMultipleItems(invoice.id, selectedIds);
    } else {
      selectedIds.forEach((id) => onDeleteItem(invoice.id, id));
    }
    setSelectedIds([]);
  };

  const handleFieldChange = (
    item: InvoiceItem,
    field: keyof InvoiceItem,
    rawValue: any
  ) => {
    let value = rawValue;
    if (
      field === 'miktar' ||
      field === 'birimFiyat' ||
      field === 'kdvOrani' ||
      field === 'iskontoOrani' ||
      field === 'iskontoTutari' ||
      field === 'satirToplami'
    ) {
      value = Number(rawValue) || 0;
    }

    onUpdateItem(invoice.id, item.id, field, value);

    if (field === 'satirToplami') {
      // Satır toplamı değiştiğinde: Birim Fiyat = Satır Toplamı / Miktar
      const miktar = Number(item.miktar) > 0 ? Number(item.miktar) : 1;
      const satirToplami = Number(value) || 0;
      const calculatedBirimFiyat = Number((satirToplami / miktar).toFixed(4));
      const kdvOrani = Number(item.kdvOrani) || 0;
      const kdvTutari = Number(((satirToplami * kdvOrani) / 100).toFixed(2));

      onUpdateItem(invoice.id, item.id, 'birimFiyat', calculatedBirimFiyat);
      onUpdateItem(invoice.id, item.id, 'kdvTutari', kdvTutari);
    } else if (field === 'miktar' || field === 'birimFiyat' || field === 'kdvOrani') {
      const miktar = field === 'miktar' ? Number(value) : Number(item.miktar) || 0;
      const birimFiyat =
        field === 'birimFiyat' ? Number(value) : Number(item.birimFiyat) || 0;
      const kdvOrani =
        field === 'kdvOrani' ? Number(value) : Number(item.kdvOrani) || 0;

      const satirToplami = Number((miktar * birimFiyat).toFixed(2));
      const kdvTutari = Number(((satirToplami * kdvOrani) / 100).toFixed(2));

      onUpdateItem(invoice.id, item.id, 'satirToplami', satirToplami);
      onUpdateItem(invoice.id, item.id, 'kdvTutari', kdvTutari);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
      {/* Active Invoice Header Banner */}
      <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
            2
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-xs sm:text-sm text-slate-800 truncate">
                {invoice.metadata.faturaNo || 'Fatura Detayı'}
              </h3>
              <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold">
                {invoiceIndex + 1} / {totalInvoices}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              {invoice.metadata.saticiUnvan || invoice.fileName} • {invoice.metadata.faturaTarihi}
            </p>
          </div>
        </div>

        {/* Navigation & Add Row */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (onToggleSplitView) {
                onToggleSplitView();
              } else {
                setShowLocalDocViewer(!showLocalDocViewer);
              }
            }}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer border ${
              isSplitView || showLocalDocViewer
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
            title="Faturanın Orijinal PDF / Görselini Bölünmüş Ekranda İncele"
          >
            <Columns className="w-3.5 h-3.5" />
            <span>{isSplitView || showLocalDocViewer ? 'Görseli Kapat' : 'Split View'}</span>
          </button>

          {totalInvoices > 1 && (
            <div className="flex items-center gap-1 mr-1">
              <button
                type="button"
                onClick={onPrevInvoice}
                disabled={invoiceIndex === 0}
                className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Önceki Fatura"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onNextInvoice}
                disabled={invoiceIndex === totalInvoices - 1}
                className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="Sonraki Fatura"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onAddItem(invoice.id)}
            className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-600" />
            <span>+ Satır</span>
          </button>
        </div>
      </div>

      {/* Duplicate Invoice Warning Banner */}
      {duplicateInvoice && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-900 gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="truncate">
              <strong>Mükerrer Fatura:</strong> Bu fatura numarası (<span className="font-mono font-bold">{invoice.metadata.faturaNo}</span>) ile listede başka bir fatura daha mevcut!
            </span>
          </div>
          <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold shrink-0">
            Çift Kayıt Uyarısı
          </span>
        </div>
      )}

      {/* Inline Document Preview (if local toggle is active and not full split view) */}
      {showLocalDocViewer && !isSplitView && (
        <div className="h-64 border-b border-slate-200 bg-slate-900 shrink-0">
          <InvoiceDocumentViewer
            invoice={invoice}
            onAttachDocument={onAttachDocument}
            isCompact={true}
          />
        </div>
      )}

      {/* Transfer Action Toolbar */}
      <div className="bg-indigo-50/70 border-b border-indigo-100 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800">
            Faturada {items.length} Kalem Var
          </span>
          {justTransferred && (
            <span className="bg-emerald-600 text-white font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1 animate-pulse">
              <CheckCircle2 className="w-3 h-3" />
              Excel'e Aktarıldı!
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-2xs flex items-center gap-1 transition-all cursor-pointer"
                title="Seçilen satırları sil"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Seçilenleri Sil ({selectedIds.length})</span>
              </button>

              <button
                type="button"
                onClick={handleTransferSelected}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span>Seçilenleri Aktar ({selectedIds.length})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            id="middle-transfer-all-btn"
            onClick={handleTransferAll}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>Tümünü Sağdaki Excel'e Aktar</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Items Table Container */}
      <div className="flex-1 overflow-x-auto min-h-[300px] max-h-[560px]">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-100 text-slate-600 font-bold border-b border-slate-200 z-10">
            <tr>
              <th className="w-8 px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleToggleSelectAll}
                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </th>
              <th className="px-3 py-2 min-w-[180px]">Ürün / Hizmet Adı (A)</th>
              <th className="w-16 px-2 py-2 text-center">Miktar (B)</th>
              <th className="w-18 px-2 py-2 text-center">Birim (C)</th>
              <th className="w-24 px-2 py-2 text-right">Fiyat (D)</th>
              <th className="w-20 px-2 py-2 text-center">KDV % (E)</th>
              <th className="w-32 px-2 py-2">Kategori (F)</th>
              <th className="w-14 px-2 py-2 text-center">Durum</th>
              <th className="w-12 px-1 py-2 text-center text-red-600 font-bold">Sil</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 bg-white">
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
                  Bu faturada henüz ürün kalemi yok.
                </td>
              </tr>
            ) : (
              items.map((item, idx) => {
                const isSelected = selectedIds.includes(item.id);

                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      item.isTransferred ? 'bg-emerald-50/30' : isSelected ? 'bg-indigo-50/40' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectOne(item.id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>

                    {/* Sütun A: Ürün Adı */}
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        value={item.urunHizmetAdi}
                        onChange={(e) =>
                          handleFieldChange(item, 'urunHizmetAdi', e.target.value)
                        }
                        placeholder="Ürün adı"
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      {item.urunKodu && (
                        <span className="text-[10px] text-slate-400 font-mono block px-1">
                          Kod: {item.urunKodu}
                        </span>
                      )}
                    </td>

                    {/* Sütun B: Miktar */}
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="number"
                        step="any"
                        value={item.miktar}
                        onChange={(e) => handleFieldChange(item, 'miktar', e.target.value)}
                        className="w-16 px-1.5 py-1 text-center font-mono font-medium text-xs bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>

                    {/* Sütun C: Birim */}
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="text"
                        list={`units-${item.id}`}
                        value={item.birim || 'Adet'}
                        onChange={(e) => handleFieldChange(item, 'birim', e.target.value)}
                        className="w-16 px-1.5 py-1 text-center italic text-xs bg-white border border-slate-200 rounded text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <datalist id={`units-${item.id}`}>
                        {COMMON_UNITS.map((u) => (
                          <option key={u} value={u} />
                        ))}
                      </datalist>
                    </td>

                    {/* Sütun D: Fiyat */}
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={item.birimFiyat}
                        onChange={(e) =>
                          handleFieldChange(item, 'birimFiyat', e.target.value)
                        }
                        className="w-20 px-1.5 py-1 text-right font-mono font-medium text-xs bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        title={
                          (item.iskontoOrani || 0) > 0
                            ? `%${item.iskontoOrani} İskontolu Net Birim Fiyat`
                            : 'KDV Hariç Net Birim Fiyat'
                        }
                      />
                      {(item.iskontoOrani || 0) > 0 && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 font-bold px-1 rounded block text-right mt-0.5" title="İskonto uygulandı">
                          -%{item.iskontoOrani} İsk.
                        </span>
                      )}
                    </td>

                    {/* Sütun E: KDV % */}
                    <td className="px-2 py-1.5 text-center">
                      <select
                        value={item.kdvOrani ?? 20}
                        onChange={(e) =>
                          handleFieldChange(item, 'kdvOrani', e.target.value)
                        }
                        className="px-1.5 py-1 text-xs bg-white border border-slate-200 rounded text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="0">%0</option>
                        <option value="1">%1</option>
                        <option value="10">%10</option>
                        <option value="20">%20</option>
                      </select>
                    </td>

                    {/* Sütun F: Kategori (Sadece Mizan'da Eklenen/Tanımlı Kategoriler) */}
                    <td className="px-2 py-1.5">
                      <select
                        value={
                          mizanCategories.includes(item.kategori || '')
                            ? item.kategori
                            : mizanCategories[0] || 'Genel Gider'
                        }
                        onChange={(e) =>
                          handleFieldChange(item, 'kategori', e.target.value)
                        }
                        className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        title="Mizan Kategorisi (Yalnızca Mizan'daki kategorilerden seçilebilir)"
                      >
                        {mizanCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Transferred Status Badge */}
                    <td className="px-2 py-1.5 text-center">
                      {item.isTransferred ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                          Aktarıldı
                        </span>
                      ) : (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                          Bekliyor
                        </span>
                      )}
                    </td>

                    {/* Delete item */}
                    <td className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteItem(invoice.id, item.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center"
                        title="Bu satırı sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Summary & Single Action */}
      <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
        <span className="text-slate-500">
          Toplam Satır Tutarı:{' '}
          <strong className="text-slate-800 font-mono font-bold">
            {formatCurrency(
              items.reduce((s, it) => s + (Number(it.satirToplami) || 0), 0),
              invoice.metadata.paraBirimi
            )}
          </strong>
        </span>

        <button
          type="button"
          onClick={handleTransferAll}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer"
        >
          <span>Excel Tablosuna Aktar ➔</span>
        </button>
      </div>
    </div>
  );
};
