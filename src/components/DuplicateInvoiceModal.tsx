import React, { useState } from 'react';
import {
  AlertTriangle,
  FileText,
  Check,
  X,
  ArrowRight,
  Copy,
  RefreshCw,
  PlusCircle,
  HelpCircle,
} from 'lucide-react';
import { ProcessedInvoice } from '../types';
import { formatCurrency } from '../lib/excelExport';

export interface DuplicateMatch {
  newInvoice: ProcessedInvoice;
  existingInvoice: ProcessedInvoice;
  matchReason: 'faturaNo' | 'ettn' | 'fileName';
  action: 'skip' | 'replace' | 'keepBoth';
}

interface DuplicateInvoiceModalProps {
  duplicates: DuplicateMatch[];
  onConfirm: (decisions: DuplicateMatch[]) => void;
  onCancel: () => void;
}

export const DuplicateInvoiceModal: React.FC<DuplicateInvoiceModalProps> = ({
  duplicates,
  onConfirm,
  onCancel,
}) => {
  const [decisions, setDecisions] = useState<DuplicateMatch[]>(duplicates);

  const handleSetAction = (index: number, action: 'skip' | 'replace' | 'keepBoth') => {
    setDecisions((prev) =>
      prev.map((item, i) => (i === index ? { ...item, action } : item))
    );
  };

  const handleSetAllAction = (action: 'skip' | 'replace' | 'keepBoth') => {
    setDecisions((prev) => prev.map((item) => ({ ...item, action })));
  };

  const getReasonLabel = (reason: 'faturaNo' | 'ettn' | 'fileName') => {
    switch (reason) {
      case 'faturaNo':
        return 'Aynı Fatura Numarası';
      case 'ettn':
        return 'Aynı ETTN (e-Fatura UUID)';
      case 'fileName':
        return 'Aynı Dosya Adı';
      default:
        return 'Mükerrer Kayıt';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-amber-500 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg leading-tight">
                Mükerrer (Çift) Fatura Tespit Edildi
              </h3>
              <p className="text-xs text-amber-100 mt-0.5">
                Yüklediğiniz dosyalardan {duplicates.length} adedi sistemde daha önce kayıtlı faturalarla eşleşiyor.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Batch Controls */}
        <div className="px-6 py-3 bg-amber-50/70 border-b border-amber-200/60 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <span className="text-amber-900 font-semibold">
            Tüm mükerrer faturalar için toplu işlem seçin:
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSetAllAction('skip')}
              className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-md font-semibold transition-colors cursor-pointer"
            >
              Tümünü Atla (Ekleme)
            </button>
            <button
              type="button"
              onClick={() => handleSetAllAction('replace')}
              className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-900 border border-indigo-300 rounded-md font-semibold transition-colors cursor-pointer"
            >
              Tümünü Güncelle (Üzerine Yaz)
            </button>
            <button
              type="button"
              onClick={() => handleSetAllAction('keepBoth')}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-semibold transition-colors cursor-pointer"
            >
              Tümünü Çift Kaydet
            </button>
          </div>
        </div>

        {/* Duplicates List */}
        <div className="flex-1 overflow-y-auto p-6 divide-y divide-slate-100 space-y-4">
          {decisions.map((dup, idx) => {
            const newInv = dup.newInvoice;
            const existInv = dup.existingInvoice;

            return (
              <div key={idx} className="pt-4 first:pt-0">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold flex items-center justify-center font-mono">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-slate-800 text-xs sm:text-sm">
                      {newInv.metadata.faturaNo || newInv.fileName}
                    </span>
                    <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                      {getReasonLabel(dup.matchReason)}
                    </span>
                  </div>
                </div>

                {/* Side by side comparison card */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  {/* Left: Existing Invoice in System */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <span>📁 Sistemde Kayıtlı Olan</span>
                    </div>
                    <p className="font-semibold text-slate-800 truncate">
                      {existInv.metadata.saticiUnvan || 'Satıcı Firma'}
                    </p>
                    <div className="text-slate-500 text-[11px] flex items-center justify-between">
                      <span>Tarih: {existInv.metadata.faturaTarihi || '-'}</span>
                      <span>{existInv.items.length} Kalem</span>
                    </div>
                    <div className="text-slate-700 font-bold text-[11px]">
                      Tutar: {formatCurrency(existInv.metadata.odenecekTutar, existInv.metadata.paraBirimi)}
                    </div>
                  </div>

                  {/* Right: Newly Uploaded Invoice */}
                  <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-200 text-xs space-y-1">
                    <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
                      <span>✨ Yeni Yüklenen Dosya</span>
                    </div>
                    <p className="font-semibold text-indigo-900 truncate">
                      {newInv.metadata.saticiUnvan || 'Satıcı Firma'}
                    </p>
                    <div className="text-indigo-600 text-[11px] flex items-center justify-between">
                      <span>Tarih: {newInv.metadata.faturaTarihi || '-'}</span>
                      <span>{newInv.items.length} Kalem</span>
                    </div>
                    <div className="text-indigo-950 font-bold text-[11px]">
                      Tutar: {formatCurrency(newInv.metadata.odenecekTutar, newInv.metadata.paraBirimi)}
                    </div>
                  </div>
                </div>

                {/* Individual Action Choice */}
                <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                  <label className="text-slate-500 text-[11px] mr-1">Bu Fatura İçin:</label>
                  <button
                    type="button"
                    onClick={() => handleSetAction(idx, 'skip')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      dup.action === 'skip'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Atla (Ekleme)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAction(idx, 'replace')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      dup.action === 'replace'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Güncelle (Üzerine Yaz)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAction(idx, 'keepBoth')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      dup.action === 'keepBoth'
                        ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Çift Olarak Ekle
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition-colors cursor-pointer"
          >
            İptal Et
          </button>
          <button
            type="button"
            onClick={() => onConfirm(decisions)}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
          >
            Seçimlerle Devam Et ➔
          </button>
        </div>
      </div>
    </div>
  );
};
