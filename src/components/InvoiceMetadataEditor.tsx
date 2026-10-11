import React, { useState } from 'react';
import {
  Calendar,
  Building2,
  CreditCard,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Trash2,
  FileText,
} from 'lucide-react';
import { ProcessedInvoice, InvoiceMetadata } from '../types';
import { formatCurrency } from '../lib/excelExport';

interface InvoiceMetadataEditorProps {
  invoice: ProcessedInvoice;
  onUpdateMetadata: (invoiceId: string, field: keyof InvoiceMetadata, value: any) => void;
  onRecalculateTotals: (invoiceId: string) => void;
  onDeleteInvoice: (invoiceId: string) => void;
}

export const InvoiceMetadataEditor: React.FC<InvoiceMetadataEditorProps> = ({
  invoice,
  onUpdateMetadata,
  onRecalculateTotals,
  onDeleteInvoice,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const meta = invoice.metadata;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 transition-all">
      {/* Bento Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
            #{invoice.metadata.faturaNo ? invoice.metadata.faturaNo.slice(-4) : 'INV'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-slate-800">
                {meta.saticiUnvan || 'Satıcı Firma Bilgisi'}
              </h3>
              <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                {meta.faturaTipi || 'SATIŞ'}
              </span>
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
              <span>No: <strong className="text-slate-700 font-mono">{meta.faturaNo || '-'}</strong></span>
              <span>•</span>
              <span>Tarih: <strong className="text-slate-700">{meta.faturaTarihi || '-'}</strong></span>
              <span>•</span>
              <span>Kalem: <strong className="text-indigo-600 font-bold">{invoice.items.length} Kalem</strong></span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onRecalculateTotals(invoice.id)}
            className="px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200 flex items-center gap-1 cursor-pointer"
            title="Kalemlerden fatura toplamlarını yeniden hesapla"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Toplamları Eşitle</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <span>{isExpanded ? 'Detayları Gizle' : 'Fatura Detaylarını Düzenle'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => onDeleteInvoice(invoice.id)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            title="Bu faturayı kaldır"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable Form */}
      {isExpanded && (
        <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs animate-in fade-in duration-150">
          {/* Column 1: Fatura ve Tarih */}
          <div className="space-y-3 bg-slate-50/60 p-4 rounded-xl border border-slate-200/70">
            <h4 className="font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              Fatura Tanım Bilgileri
            </h4>

            <div>
              <label className="text-slate-500 block mb-1 font-medium">Fatura Numarası</label>
              <input
                type="text"
                value={meta.faturaNo}
                onChange={(e) => onUpdateMetadata(invoice.id, 'faturaNo', e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-500 block mb-1 font-medium">Fatura Tarihi</label>
                <input
                  type="date"
                  value={meta.faturaTarihi}
                  onChange={(e) => onUpdateMetadata(invoice.id, 'faturaTarihi', e.target.value)}
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1 font-medium">Düzenleme Saati</label>
                <input
                  type="text"
                  value={meta.duzenlemeSaati || ''}
                  placeholder="14:30"
                  onChange={(e) => onUpdateMetadata(invoice.id, 'duzenlemeSaati', e.target.value)}
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-500 block mb-1 font-medium">Fatura Türü</label>
                <input
                  type="text"
                  value={meta.faturaTipi || 'SATIŞ'}
                  onChange={(e) => onUpdateMetadata(invoice.id, 'faturaTipi', e.target.value)}
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1 font-medium">Para Birimi</label>
                <select
                  value={meta.paraBirimi || 'TRY'}
                  onChange={(e) => onUpdateMetadata(invoice.id, 'paraBirimi', e.target.value)}
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="TRY">TRY (₺)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Column 2: Taraflar */}
          <div className="space-y-3 bg-slate-50/60 p-4 rounded-xl border border-slate-200/70">
            <h4 className="font-bold text-slate-700 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              Taraflar (Satıcı & Alıcı)
            </h4>

            <div>
              <label className="text-slate-500 block mb-1 font-medium">Satıcı Firma Ünvanı</label>
              <input
                type="text"
                value={meta.saticiUnvan}
                onChange={(e) => onUpdateMetadata(invoice.id, 'saticiUnvan', e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-500 block mb-1 font-medium">Satıcı VKN/TCKN</label>
                <input
                  type="text"
                  value={meta.saticiVknTckn}
                  onChange={(e) => onUpdateMetadata(invoice.id, 'saticiVknTckn', e.target.value)}
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1 font-medium">Alıcı VKN/TCKN</label>
                <input
                  type="text"
                  value={meta.aliciVknTckn || ''}
                  onChange={(e) => onUpdateMetadata(invoice.id, 'aliciVknTckn', e.target.value)}
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-500 block mb-1 font-medium">Alıcı Firma Ünvanı</label>
              <input
                type="text"
                value={meta.aliciUnvan}
                onChange={(e) => onUpdateMetadata(invoice.id, 'aliciUnvan', e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Column 3: Parasal Toplamlar */}
          <div className="space-y-3 bg-slate-50/60 p-4 rounded-xl border border-slate-200/70">
            <h4 className="font-bold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                Mali Toplamlar
              </span>
            </h4>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-500 block mb-1 font-medium">Mal/Hizmet Matrahı</label>
                <input
                  type="number"
                  step="0.01"
                  value={meta.malHizmetToplamTutari}
                  onChange={(e) =>
                    onUpdateMetadata(invoice.id, 'malHizmetToplamTutari', Number(e.target.value))
                  }
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono text-right focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1 font-medium">Toplam KDV</label>
                <input
                  type="number"
                  step="0.01"
                  value={meta.toplamKdv}
                  onChange={(e) =>
                    onUpdateMetadata(invoice.id, 'toplamKdv', Number(e.target.value))
                  }
                  className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono text-right font-semibold focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-500 block mb-1 font-medium">Genel Toplam (Ödenecek)</label>
              <input
                type="number"
                step="0.01"
                value={meta.odenecekTutar}
                onChange={(e) =>
                  onUpdateMetadata(invoice.id, 'odenecekTutar', Number(e.target.value))
                }
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-indigo-700 font-mono text-right font-bold text-sm focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-slate-500 block mb-1 font-medium">Fatura Notları</label>
              <input
                type="text"
                value={meta.notlar || ''}
                placeholder="Açıklama veya ödeme şekli..."
                onChange={(e) => onUpdateMetadata(invoice.id, 'notlar', e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
