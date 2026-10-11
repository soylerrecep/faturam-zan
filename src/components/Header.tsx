import React from 'react';
import {
  FileText,
  Copy,
  Plus,
  UploadCloud,
  CheckCircle2,
  Sparkles,
  Download,
  Receipt,
  Layers,
  Database,
  Trash2,
  FileSpreadsheet,
  ArrowRight,
  Boxes,
  ScanLine,
} from 'lucide-react';
import { ProcessedInvoice, MasterExcelRow, AppMainSection } from '../types';

interface HeaderProps {
  currentSection: AppMainSection;
  setCurrentSection: (section: AppMainSection) => void;
  invoices: ProcessedInvoice[];
  masterExcelRows: MasterExcelRow[];
  totalMizanItems: number;
  activeInvoiceId: string;
  setActiveInvoiceId: (id: string) => void;
  onUploadClick: () => void;
  onExportExcel: () => void;
  onCopyClipboard: () => void;
  onClearAll: () => void;
  copySuccess: boolean;
  onBackupData: () => void;
  onRestoreData: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentSection,
  setCurrentSection,
  invoices,
  masterExcelRows,
  totalMizanItems,
  activeInvoiceId,
  setActiveInvoiceId,
  onUploadClick,
  onExportExcel,
  onCopyClipboard,
  onClearAll,
  copySuccess,
  onBackupData,
  onRestoreData,
}) => {
  const activeInvoice = invoices.find((i) => i.id === activeInvoiceId) || invoices[0];

  return (
    <header className="bg-white border-b border-slate-200 shrink-0 sticky top-0 z-30 shadow-xs">
      {/* Top Main Navigation Bar */}
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo & Main 2-Section Tabs */}
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="font-bold text-base tracking-tight text-slate-900 leading-tight">
                Fatura & Stok Yönetimi
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">OCR • Excel • Mizan</p>
            </div>
          </div>

          {/* 🌟 2 ANA BÖLÜM: FATURA TARA & MİZAN */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
            {/* 1. BÖLÜM: FATURA TARA */}
            <button
              id="nav-btn-fatura-tara"
              onClick={() => setCurrentSection('fatura-tara')}
              className={`px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                currentSection === 'fatura-tara'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <ScanLine className="w-4 h-4" />
              <span>FATURA TARA</span>
              {invoices.length > 0 && (
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    currentSection === 'fatura-tara'
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {invoices.length}
                </span>
              )}
            </button>

            {/* 2. BÖLÜM: MİZAN */}
            <button
              id="nav-btn-mizan"
              onClick={() => setCurrentSection('mizan')}
              className={`px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                currentSection === 'mizan'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>MİZAN</span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  currentSection === 'mizan'
                    ? 'bg-white/20 text-white'
                    : totalMizanItems > 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {totalMizanItems}
              </span>
            </button>
          </div>
        </div>

        {/* Right Action Bar */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {currentSection === 'fatura-tara' ? (
            <>
              {invoices.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    id="header-excel-save-btn"
                    onClick={onExportExcel}
                    disabled={masterExcelRows.length === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#107c41] hover:bg-[#0b5a2f] text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Sağdaki Excel tablosunu .xlsx olarak kaydet"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Excel Kaydet ({masterExcelRows.length})</span>
                  </button>
                </div>
              )}

              <button
                id="upload-new-file-btn"
                onClick={onUploadClick}
                className="bg-indigo-600 text-white px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <UploadCloud className="w-4 h-4" />
                <span>+ PDF Yükle</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 hidden md:inline">
                Mizanda <strong>{totalMizanItems}</strong> kalem ürün kayıtlı
              </span>
              <button
                onClick={() => setCurrentSection('fatura-tara')}
                className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ScanLine className="w-3.5 h-3.5" />
                <span>Fatura Taramaya Dön</span>
              </button>
            </div>
          )}

          {/* Yedekle & Geri Yükle (Her zaman görünür) */}
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
            <button
              type="button"
              onClick={onBackupData}
              className="px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              title="Tüm faturaları, Excel tablosunu ve Mizan verilerini .json dosyası olarak yedekle"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden xl:inline">Yedekle</span>
            </button>

            <label
              className="px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              title="Yedek dosyasından (.json) tüm verileri ve mizanı geri yükle"
            >
              <UploadCloud className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden xl:inline">Geri Yükle</span>
              <input
                type="file"
                accept=".json"
                onChange={onRestoreData}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Workflow Step Breadcrumbs Strip (only on Fatura Tara view) */}
      {currentSection === 'fatura-tara' && (
        <div className="bg-slate-50/90 border-t border-slate-200/80 px-4 sm:px-6 lg:px-8 py-2">
          <div className="max-w-[1720px] mx-auto flex items-center justify-between gap-3 text-xs overflow-x-auto">
            <div className="flex items-center gap-3 text-slate-600 font-medium">
              <span className="flex items-center gap-1.5 text-indigo-700 font-bold">
                <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px]">
                  1
                </span>
                PDF Fatura Yükle ({invoices.length})
              </span>

              <ArrowRight className="w-3 h-3 text-slate-300" />

              <span className="flex items-center gap-1.5 text-indigo-700 font-bold">
                <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px]">
                  2
                </span>
                Orta Kısımda İncele / Düzenle & Aktar
              </span>

              <ArrowRight className="w-3 h-3 text-slate-300" />

              <span className="flex items-center gap-1.5 text-emerald-800 font-bold">
                <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px]">
                  3
                </span>
                Excel Tablosu & Mizana Ekle/Düşür
              </span>
            </div>

            {invoices.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-slate-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors ml-auto cursor-pointer inline-flex items-center gap-1 text-xs"
                title="Tüm verileri temizle"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium hidden sm:inline">Temizle</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
