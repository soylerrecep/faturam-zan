import React, { useRef } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  Clock,
  Trash2,
  Layers,
  Sparkles,
  ChevronRight,
  Database,
  ArrowRight,
  Send,
  AlertTriangle,
} from 'lucide-react';
import { ProcessedInvoice } from '../types';

interface InvoiceQueuePanelProps {
  invoices: ProcessedInvoice[];
  activeInvoiceId: string;
  onSelectInvoice: (id: string) => void;
  onDeleteInvoice: (id: string) => void;
  onUploadClick: () => void;
  onTransferAllInvoicesToExcel: () => void;
}

export const InvoiceQueuePanel: React.FC<InvoiceQueuePanelProps> = ({
  invoices,
  activeInvoiceId,
  onSelectInvoice,
  onDeleteInvoice,
  onUploadClick,
  onTransferAllInvoicesToExcel,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
      {/* Panel Header */}
      <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
            1
          </div>
          <div>
            <h3 className="font-bold text-xs sm:text-sm text-slate-800 leading-tight">
              PDF Yükle & Fatura Sırası
            </h3>
            <span className="text-[11px] text-slate-500">
              {invoices.length} Dosya Yüklendi
            </span>
          </div>
        </div>

        <button
          onClick={onUploadClick}
          id="queue-upload-new-pdf-btn"
          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>+ PDF Yükle</span>
        </button>
      </div>

      {/* Quick Upload Drop Area if empty or compact */}
      <div className="p-3 border-b border-slate-100 bg-slate-50/40">
        <button
          type="button"
          onClick={onUploadClick}
          className="w-full border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-lg p-3 text-center transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-center gap-2 text-slate-600 group-hover:text-indigo-600">
            <UploadCloud className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-semibold">Toplu PDF Sürükle veya Tıkla</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Birden çok faturayı aynı anda yükleyebilirsiniz
          </p>
        </button>
      </div>

      {/* Invoice List (Sırayla Okuma Listesi) */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 min-h-[220px]">
        {invoices.length === 0 ? (
          <div className="p-6 text-center text-slate-400">
            <Layers className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-medium text-slate-600">Yüklü fatura yok</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Yukarıdaki butondan PDF faturalarınızı yükleyin.
            </p>
          </div>
        ) : (
          invoices.map((inv, index) => {
            const isActive = inv.id === activeInvoiceId;
            const transferredCount = inv.items.filter((x) => x.isTransferred).length;
            const isFullyTransferred =
              inv.items.length > 0 && transferredCount === inv.items.length;

            const isDuplicate = invoices.some((other) => {
              if (other.id === inv.id) return false;
              const f1 = (inv.metadata.faturaNo || '').trim().toLowerCase();
              const f2 = (other.metadata.faturaNo || '').trim().toLowerCase();
              const e1 = (inv.metadata.ettn || '').trim().toLowerCase();
              const e2 = (other.metadata.ettn || '').trim().toLowerCase();
              if (f1 && f2 && f1 === f2 && !f1.startsWith('fat-')) return true;
              if (e1 && e2 && e1 === e2) return true;
              return false;
            });

            return (
              <div
                key={inv.id}
                onClick={() => onSelectInvoice(inv.id)}
                className={`p-3 transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                  isActive
                    ? 'bg-indigo-50/80 border-l-4 border-indigo-600 pl-2.5'
                    : 'hover:bg-slate-50 border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-xs font-bold font-mono mt-0.5 ${
                      isActive
                        ? 'bg-indigo-600 text-white'
                        : isFullyTransferred
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {index + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-800 truncate block">
                        {inv.metadata.faturaNo || `Fatura #${index + 1}`}
                      </span>
                      {isDuplicate && (
                        <span
                          className="bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-bold px-1.5 py-0.2 rounded-full shrink-0 flex items-center gap-0.5"
                          title="Bu fatura numarası ile listede birden fazla kayıt mevcut"
                        >
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Mükerrer
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 truncate font-medium">
                      {inv.metadata.saticiUnvan || inv.fileName}
                    </p>

                    <div className="flex items-center gap-2 mt-1 text-[10px]">
                      <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono font-medium">
                        {inv.items.length} Kalem
                      </span>

                      {isFullyTransferred ? (
                        <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Aktarıldı
                        </span>
                      ) : transferredCount > 0 ? (
                        <span className="text-indigo-600 font-medium">
                          {transferredCount}/{inv.items.length} Aktarıldı
                        </span>
                      ) : (
                        <span className="text-amber-600 font-medium">
                          İnceleme Bekliyor
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteInvoice(inv.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all cursor-pointer inline-flex items-center justify-center"
                    title="Bu faturayı listeden sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight
                    className={`w-4 h-4 ${
                      isActive ? 'text-indigo-600 translate-x-0.5' : 'text-slate-300'
                    } transition-transform`}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Panel Footer / Batch Action */}
      {invoices.length > 1 && (
        <div className="p-3 border-t border-slate-100 bg-slate-50/80 shrink-0">
          <button
            onClick={onTransferAllInvoicesToExcel}
            className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Send className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tüm Faturaları Excel'e Aktar</span>
          </button>
        </div>
      )}
    </div>
  );
};
