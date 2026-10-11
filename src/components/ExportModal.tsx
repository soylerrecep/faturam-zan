import React, { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  FileText,
  Copy,
  Download,
  Settings2,
  Check,
} from 'lucide-react';
import { ProcessedInvoice } from '../types';
import { exportInvoicesToExcel, exportInvoicesToCSV, copyItemsToClipboard } from '../lib/excelExport';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoices: ProcessedInvoice[];
  activeInvoiceId: string | 'all';
  selectedItemIds?: string[];
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  invoices,
  activeInvoiceId,
  selectedItemIds = [],
}) => {
  const [exportScope, setExportScope] = useState<'all' | 'active' | 'selected'>(
    selectedItemIds.length > 0 ? 'selected' : 'all'
  );
  const [includeMetadataSheet, setIncludeMetadataSheet] = useState(true);
  const [customFilename, setCustomFilename] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const targetInvoices =
    exportScope === 'active' && activeInvoiceId !== 'all'
      ? invoices.filter((inv) => inv.id === activeInvoiceId)
      : invoices;

  const totalItemsCount = targetInvoices.reduce((acc, inv) => {
    if (exportScope === 'selected') {
      return acc + inv.items.filter((item) => selectedItemIds.includes(item.id)).length;
    }
    return acc + inv.items.length;
  }, 0);

  const handleExcelExport = () => {
    exportInvoicesToExcel(targetInvoices, {
      includeMetadataSheet,
      selectedOnly: exportScope === 'selected',
      selectedItemIds,
      filename: customFilename ? `${customFilename.replace(/\.xlsx$/i, '')}.xlsx` : undefined,
    });
    onClose();
  };

  const handleCSVExport = () => {
    exportInvoicesToCSV(targetInvoices, {
      selectedOnly: exportScope === 'selected',
      selectedItemIds,
    });
    onClose();
  };

  const handleCopyClipboard = async () => {
    const allItems = targetInvoices.flatMap((inv) =>
      exportScope === 'selected'
        ? inv.items.filter((it) => selectedItemIds.includes(it.id))
        : inv.items
    );

    const success = await copyItemsToClipboard(allItems);
    if (success) {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 900);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Excel ve Tablo Dışa Aktarma
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 text-xs text-slate-700">
          {/* Scope selection */}
          <div>
            <label className="font-bold text-slate-800 block mb-2 uppercase tracking-wider text-[10px]">
              Dışa Aktarılacak Kapsam:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setExportScope('all')}
                className={`p-3 rounded-lg border text-center transition-all cursor-pointer ${
                  exportScope === 'all'
                    ? 'border-indigo-600 bg-indigo-50/60 text-indigo-700 font-bold shadow-2xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div>Tüm Faturalar</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{invoices.length} Fatura</div>
              </button>

              <button
                type="button"
                onClick={() => setExportScope('active')}
                disabled={activeInvoiceId === 'all'}
                className={`p-3 rounded-lg border text-center transition-all cursor-pointer ${
                  activeInvoiceId === 'all'
                    ? 'opacity-40 cursor-not-allowed border-slate-200'
                    : exportScope === 'active'
                    ? 'border-indigo-600 bg-indigo-50/60 text-indigo-700 font-bold shadow-2xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div>Seçili Fatura</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Aktif Sekme</div>
              </button>

              <button
                type="button"
                onClick={() => setExportScope('selected')}
                disabled={selectedItemIds.length === 0}
                className={`p-3 rounded-lg border text-center transition-all cursor-pointer ${
                  selectedItemIds.length === 0
                    ? 'opacity-40 cursor-not-allowed border-slate-200'
                    : exportScope === 'selected'
                    ? 'border-indigo-600 bg-indigo-50/60 text-indigo-700 font-bold shadow-2xs'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div>Seçilen Kalemler</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {selectedItemIds.length} Kalem
                </div>
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h4 className="font-bold text-slate-700 flex items-center gap-1.5 text-xs">
              <Settings2 className="w-3.5 h-3.5 text-indigo-600" />
              Excel Biçimlendirme
            </h4>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeMetadataSheet}
                onChange={(e) => setIncludeMetadataSheet(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-slate-600 font-medium">
                Fatura Özetleri Sayfasını Ayrı Sekme Olarak Ekle
              </span>
            </label>

            <div>
              <label className="text-slate-500 block mb-1">Özel Dosya Adı (İsteğe Bağlı)</label>
              <input
                type="text"
                value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                placeholder="Örn: Fatura_Kalemleri_2025"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Export Output summary */}
          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg flex items-center justify-between text-xs text-emerald-800 font-medium">
            <span>Dışa aktarılacak toplam ürün/hizmet:</span>
            <span className="font-bold text-sm">{totalItemsCount} Kalem</span>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            <button
              onClick={handleCopyClipboard}
              className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-500" />
                  <span>Panoya Al</span>
                </>
              )}
            </button>

            <button
              onClick={handleCSVExport}
              className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-4 h-4 text-slate-500" />
              <span>CSV İndir</span>
            </button>

            <button
              onClick={handleExcelExport}
              className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Excel İndir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
