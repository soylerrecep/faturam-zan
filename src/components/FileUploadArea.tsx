import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2,
  X,
  Sparkles,
  Database,
  ShieldCheck,
  FileSpreadsheet,
  RotateCw,
} from 'lucide-react';
import { ProcessedInvoice } from '../types';
import { saveInvoiceDocument } from '../lib/documentStorage';

interface FileUploadAreaProps {
  onInvoicesParsed: (newInvoices: ProcessedInvoice[]) => void;
  hasInvoices: boolean;
  isOpenModal?: boolean;
  onCloseModal?: () => void;
  mizanCategories?: string[];
}

interface UploadQueueItem {
  id: string;
  file: File;
  status: 'pending' | 'reading' | 'analyzing' | 'done' | 'error';
  errorMessage?: string;
  progressText?: string;
}

export const FileUploadArea: React.FC<FileUploadAreaProps> = ({
  onInvoicesParsed,
  hasInvoices,
  isOpenModal = false,
  onCloseModal,
  mizanCategories,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleFiles = async (files: File[]) => {
    const validFiles = files.filter(
      (f) =>
        f.type === 'application/pdf' ||
        f.type.startsWith('image/') ||
        f.name.toLowerCase().endsWith('.pdf')
    );

    if (validFiles.length === 0) {
      alert('Lütfen geçerli bir PDF veya Fatura Görseli (JPG/PNG) yükleyin.');
      return;
    }

    const newQueueItems: UploadQueueItem[] = validFiles.map((file) => ({
      id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      status: 'pending',
      progressText: 'Sıraya alındı...',
    }));

    setQueue((prev) => [...prev, ...newQueueItems]);
    processQueue(newQueueItems);
  };

  const retrySingleItem = (item: UploadQueueItem) => {
    const freshItem: UploadQueueItem = {
      ...item,
      status: 'pending',
      errorMessage: undefined,
      progressText: 'Tekrar deneniyor...',
    };
    setQueue((prev) => prev.map((q) => (q.id === item.id ? freshItem : q)));
    processQueue([freshItem]);
  };

  const processQueue = async (items: UploadQueueItem[]) => {
    setIsProcessing(true);
    const parsedResults: ProcessedInvoice[] = [];

    for (const item of items) {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: 'reading', progressText: 'Dosya okunuyor...' }
            : q
        )
      );

      try {
        const fileBase64 = await readFileAsBase64(item.file);
        const mimeType =
          item.file.type ||
          (item.file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

        let result: any = null;
        let lastErrorText = '';
        const maxClientAttempts = 3;

        for (let attempt = 1; attempt <= maxClientAttempts; attempt++) {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: 'analyzing',
                    progressText:
                      attempt === 1
                        ? 'Gemini AI fatura satırlarını ayıklıyor...'
                        : `Yoğunluk nedeniyle tekrar deneniyor (${attempt}/${maxClientAttempts})...`,
                  }
                : q
            )
          );

          try {
            const response = await fetch('/api/parse-invoice', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileBase64,
                mimeType,
                fileName: item.file.name,
                availableCategories: mizanCategories,
              }),
            });

            const resJson = await response.json();
            if (response.ok && resJson.success) {
              result = resJson;
              break;
            } else {
              lastErrorText = resJson.error || 'Fatura analiz edilemedi.';
            }
          } catch (fetchErr: any) {
            lastErrorText = fetchErr.message || 'Sunucu bağlantı hatası.';
          }

          if (attempt < maxClientAttempts) {
            await new Promise((r) => setTimeout(r, 1500 * attempt));
          }
        }

        if (!result || !result.success) {
          throw new Error(lastErrorText || 'Yapay zeka modelleri yoğunluk yaşıyor.');
        }

        const data = result.data;
        const newInvoiceId = `inv-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`;
        // Save document to IndexedDB for persistent split view
        saveInvoiceDocument(newInvoiceId, fileBase64, item.file.name);

        const processedInvoice: ProcessedInvoice = {
          id: newInvoiceId,
          fileName: item.file.name,
          fileSize: item.file.size,
          fileType: mimeType,
          fileDataUrl: fileBase64,
          uploadDate: new Date().toISOString(),
          status: 'success',
          metadata: {
            faturaNo: data.metadata?.faturaNo || `FAT-${Date.now().toString().slice(-6)}`,
            faturaTarihi:
              data.metadata?.faturaTarihi || new Date().toISOString().slice(0, 10),
            duzenlemeSaati: data.metadata?.duzenlemeSaati || '',
            faturaTipi: data.metadata?.faturaTipi || 'SATIŞ',
            ettn: data.metadata?.ettn || '',
            saticiUnvan: data.metadata?.saticiUnvan || 'Satıcı Firma',
            saticiVknTckn: data.metadata?.saticiVknTckn || '',
            saticiVergiDairesi: data.metadata?.saticiVergiDairesi || '',
            saticiAdres: data.metadata?.saticiAdres || '',
            aliciUnvan: data.metadata?.aliciUnvan || 'Alıcı Firma / Müşteri',
            aliciVknTckn: data.metadata?.aliciVknTckn || '',
            aliciAdres: data.metadata?.aliciAdres || '',
            paraBirimi: data.metadata?.paraBirimi || 'TRY',
            odemeSekli: data.metadata?.odemeSekli || '',
            malHizmetToplamTutari: Number(data.metadata?.malHizmetToplamTutari) || 0,
            toplamIskonto: Number(data.metadata?.toplamIskonto) || 0,
            toplamKdv: Number(data.metadata?.toplamKdv) || 0,
            odenecekTutar: Number(data.metadata?.odenecekTutar) || 0,
            notlar: data.metadata?.notlar || '',
          },
          items: (data.items || []).map((it: any, idx: number) => {
            const miktar = Number(it.miktar) > 0 ? Number(it.miktar) : 1;
            let birimFiyat = Number(it.birimFiyat) || 0;
            const iskontoOrani = Number(it.iskontoOrani) || 0;
            const iskontoTutari = Number(it.iskontoTutari) || 0;
            let satirToplami = Number(it.satirToplami) || 0;

            // 1. İskonto oranı veya tutarı varsa birim fiyata uygula
            if (iskontoOrani > 0 && birimFiyat > 0) {
              birimFiyat = birimFiyat * (1 - iskontoOrani / 100);
            } else if (iskontoTutari > 0 && miktar > 0 && birimFiyat > 0) {
              birimFiyat = birimFiyat - (iskontoTutari / miktar);
            } else if (satirToplami > 0 && miktar > 0) {
              // 2. İskonto yapılamıyorsa veya net toplam varsa: Tutar ÷ Miktar
              birimFiyat = satirToplami / miktar;
            }

            // 3. Tutar ve miktar doğrulaması
            if (satirToplami > 0 && miktar > 0 && Math.abs((miktar * birimFiyat) - satirToplami) > 0.01) {
              birimFiyat = satirToplami / miktar;
            }

            if (satirToplami === 0 && birimFiyat > 0) {
              satirToplami = Number((miktar * birimFiyat).toFixed(2));
            }

            const kdvOrani = Number(it.kdvOrani) ?? 20;
            let kdvTutari = Number(it.kdvTutari) || 0;
            if (kdvTutari === 0 && satirToplami > 0) {
              kdvTutari = Number(((satirToplami * kdvOrani) / 100).toFixed(2));
            }

            return {
              id: `item-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
              siraNo: it.siraNo || idx + 1,
              urunHizmetAdi: it.urunHizmetAdi || 'Ürün / Hizmet',
              urunKodu: it.urunKodu || '',
              aciklama: it.aciklama || '',
              miktar,
              birim: it.birim || 'Adet',
              birimFiyat: Number(birimFiyat.toFixed(4)),
              iskontoOrani,
              iskontoTutari,
              kdvOrani,
              kdvTutari,
              satirToplami: Number(satirToplami.toFixed(2)),
              kategori: it.kategori || 'Genel Gider',
              paraBirimi: it.paraBirimi || data.metadata?.paraBirimi || 'TRY',
            };
          }),
        };

        if (
          processedInvoice.metadata.odenecekTutar === 0 &&
          processedInvoice.items.length > 0
        ) {
          const matrah = processedInvoice.items.reduce(
            (s, x) => s + (x.satirToplami || 0),
            0
          );
          const kdv = processedInvoice.items.reduce(
            (s, x) => s + (x.kdvTutari || 0),
            0
          );
          processedInvoice.metadata.malHizmetToplamTutari = matrah;
          processedInvoice.metadata.toplamKdv = kdv;
          processedInvoice.metadata.odenecekTutar = matrah + kdv;
        }

        parsedResults.push(processedInvoice);

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: 'done', progressText: 'Tamamlandı' }
              : q
          )
        );
      } catch (err: any) {
        console.error('File process error:', err);
        let errorTxt = err.message || 'Analiz başarısız oldu.';
        if (errorTxt.includes('503') || errorTxt.includes('high demand') || errorTxt.includes('UNAVAILABLE')) {
          errorTxt = 'Model yoğunluğu (503). Lütfen tekrar deneyin.';
        }
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'error',
                  errorMessage: errorTxt,
                  progressText: errorTxt,
                }
              : q
          )
        );
      }
    }

    setIsProcessing(false);

    if (parsedResults.length > 0) {
      onInvoicesParsed(parsedResults);
      if (onCloseModal) {
        setTimeout(() => {
          onCloseModal();
          setQueue([]);
        }, 800);
      }
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const content = (
    <div className="w-full">
      {/* Bento Upload Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 group ${
          isDragging
            ? 'border-indigo-600 bg-indigo-50/50 scale-[1.01]'
            : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50/70 shadow-xs'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />

        <div className="max-w-xl mx-auto flex flex-col items-center">
          <div className="w-14 h-14 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform mb-4">
            <UploadCloud className="w-7 h-7" />
          </div>

          <h3 className="text-xl font-bold text-slate-800 mb-2">
            PDF Fatura Dosyalarınızı Buraya Sürükleyin veya Seçin
          </h3>

          <p className="text-xs sm:text-sm text-slate-600 mb-6 max-w-md leading-relaxed">
            Tek veya <strong>çok sayfalı (multi-page)</strong> e-Fatura, e-Arşiv ve taranmış PDF faturalarınızı yükleyin.
            Yapay zeka tüm sayfalardaki mal, ürün ve hizmet kalemlerini iskonto ve birim fiyatlarıyla eksiksiz ayıklar.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              id="select-pdf-button"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              PDF / Fatura Dosyası Seç
            </button>
          </div>

          {/* Formats & Security Badge */}
          <div className="mt-6 pt-6 border-t border-slate-100 w-full flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium text-slate-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Güvenli ve Otomatik Yedekli OCR
            </span>
            <span>•</span>
            <span>Desteklenenler: PDF, PNG, JPG (e-Fatura & e-Arşiv)</span>
            <span>•</span>
            <span>Çoklu Fatura Desteği</span>
          </div>
        </div>
      </div>

      {/* Upload Queue & Progress Monitor */}
      {queue.length > 0 && (
        <div className="mt-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
              İşlenen Dosyalar ({queue.length})
            </h4>
            {isProcessing && (
              <span className="text-xs text-indigo-600 font-medium flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                OCR ve Kalem Ayıklama Devam Ediyor...
              </span>
            )}
          </div>

          <div className="space-y-2">
            {queue.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate">
                      {item.file.name}
                    </p>
                    <p className="text-slate-500 text-[11px]">
                      {(item.file.size / 1024).toFixed(1)} KB • {item.progressText}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.status === 'reading' || item.status === 'analyzing' ? (
                    <div className="flex items-center gap-1.5 text-indigo-600 font-medium bg-indigo-50 px-2.5 py-1 rounded-md">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>İnceleniyor</span>
                    </div>
                  ) : item.status === 'done' ? (
                    <div className="flex items-center gap-1.5 text-emerald-700 font-medium bg-emerald-50 px-2.5 py-1 rounded-md">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Ayıklandı</span>
                    </div>
                  ) : item.status === 'error' ? (
                    <div className="flex items-center gap-2">
                      <div
                        className="flex items-center gap-1.5 text-red-700 font-medium bg-red-50 px-2.5 py-1 rounded-md"
                        title={item.errorMessage}
                      >
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                        <span className="max-w-[140px] truncate">{item.errorMessage || 'Hata'}</span>
                      </div>
                      <button
                        onClick={() => retrySingleItem(item)}
                        className="flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-[11px] font-semibold border border-indigo-200 transition-colors cursor-pointer"
                        title="Bu dosyayı tekrar analiz et"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>Tekrar Dene</span>
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-400">Beklemede</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (isOpenModal) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-indigo-600" />
              Yeni PDF Fatura Yükle
            </h3>
            <button
              onClick={onCloseModal}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">{content}</div>
        </div>
      </div>
    );
  }

  return content;
};
