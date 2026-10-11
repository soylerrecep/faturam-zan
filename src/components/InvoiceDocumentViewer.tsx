import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  Download,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { ProcessedInvoice } from '../types';
import { getInvoiceDocument, saveInvoiceDocument } from '../lib/documentStorage';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

interface InvoiceDocumentViewerProps {
  invoice: ProcessedInvoice;
  onAttachDocument?: (invoiceId: string, dataUrl: string, fileType: string) => void;
  className?: string;
  isCompact?: boolean;
}

// Convert Base64 / Data URL to Uint8Array safely for PDF.js and Blob operations
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Create safe Blob URL for opening in a new tab or downloading without Chrome iframe block
function createBlobUrl(dataUrl: string, defaultType: string = 'application/pdf'): string | null {
  try {
    const bytes = dataUrlToUint8Array(dataUrl);
    let mimeType = defaultType;
    if (dataUrl.startsWith('data:')) {
      const match = dataUrl.match(/^data:([^;]+);/);
      if (match && match[1]) {
        mimeType = match[1];
      }
    }
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error('Blob URL creation error:', e);
    return null;
  }
}

export const InvoiceDocumentViewer: React.FC<InvoiceDocumentViewerProps> = ({
  invoice,
  onAttachDocument,
  className = '',
  isCompact = false,
}) => {
  const [docDataUrl, setDocDataUrl] = useState<string | null>(invoice.fileDataUrl || null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // PDF.js State
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isPdfRendering, setIsPdfRendering] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load document from IndexedDB if not present in memory
  useEffect(() => {
    let isMounted = true;
    if (invoice.fileDataUrl) {
      setDocDataUrl(invoice.fileDataUrl);
      return;
    }

    setIsLoading(true);
    getInvoiceDocument(invoice.id)
      .then((data) => {
        if (isMounted) {
          setDocDataUrl(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [invoice.id, invoice.fileDataUrl]);

  const isPdf =
    invoice.fileType === 'application/pdf' ||
    (invoice.fileName && invoice.fileName.toLowerCase().endsWith('.pdf')) ||
    (docDataUrl && docDataUrl.startsWith('data:application/pdf')) ||
    (docDataUrl && docDataUrl.includes('application/pdf'));

  // Load PDF Document using PDF.js
  useEffect(() => {
    if (!docDataUrl || !isPdf) {
      setPdfDoc(null);
      setPdfError(null);
      return;
    }

    let isCancelled = false;
    setPdfError(null);

    try {
      const u8Data = dataUrlToUint8Array(docDataUrl);
      const loadingTask = pdfjsLib.getDocument({
        data: u8Data,
        cMapUrl: 'https://unpkg.com/pdfjs-dist@' + pdfjsLib.version + '/cmaps/',
        cMapPacked: true,
      });

      loadingTask.promise
        .then((doc) => {
          if (!isCancelled) {
            setPdfDoc(doc);
            setNumPages(doc.numPages || 1);
            setCurrentPage(1);
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            console.error('PDF.js loading failed:', err);
            setPdfError('PDF formatı okunamadı veya şifreli/hasarlı.');
          }
        });
    } catch (err: any) {
      if (!isCancelled) {
        console.error('PDF parsing error:', err);
        setPdfError('PDF verisi işlenemedi.');
      }
    }

    return () => {
      isCancelled = true;
    };
  }, [docDataUrl, isPdf]);

  // Render Current PDF Page onto HTML5 Canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !isPdf) return;

    let renderTask: any = null;
    let isCancelled = false;

    const renderPdfPage = async () => {
      try {
        setIsPdfRendering(true);
        const page = await pdfDoc.getPage(currentPage);
        if (isCancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        // Calculate scale with zoom and crisp pixel ratio
        const scaleMultiplier = (zoomLevel / 100) * 1.5;
        const viewport = page.getViewport({
          scale: scaleMultiplier,
          rotation: rotation,
        });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
        if (!isCancelled) {
          setIsPdfRendering(false);
        }
      } catch (err: any) {
        if (!isCancelled && err?.name !== 'RenderingCancelledException') {
          console.warn('PDF page rendering warning:', err);
          setIsPdfRendering(false);
        }
      }
    };

    renderPdfPage();

    return () => {
      isCancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, currentPage, zoomLevel, rotation, isPdf]);

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 25, 300));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 25, 50));
  const handleResetZoom = () => {
    setZoomLevel(100);
    setRotation(0);
  };
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  const handlePrevPage = () => {
    setCurrentPage((p) => Math.max(p - 1, 1));
  };
  const handleNextPage = () => {
    setCurrentPage((p) => Math.min(p + 1, numPages));
  };

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setDocDataUrl(result);
        saveInvoiceDocument(invoice.id, result, file.name);
        if (onAttachDocument) {
          onAttachDocument(invoice.id, result, file.type || 'application/pdf');
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  const handleDownload = () => {
    if (!docDataUrl) return;
    const blobUrl = createBlobUrl(docDataUrl, isPdf ? 'application/pdf' : 'image/jpeg');
    if (!blobUrl) return;

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = invoice.fileName || `fatura_${invoice.metadata.faturaNo || invoice.id}.${isPdf ? 'pdf' : 'jpg'}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(blobUrl);
    }, 1000);
  };

  const handleOpenNewTab = () => {
    if (!docDataUrl) return;
    const blobUrl = createBlobUrl(docDataUrl, isPdf ? 'application/pdf' : 'image/jpeg');
    if (blobUrl) {
      window.open(blobUrl, '_blank');
    }
  };

  return (
    <div
      className={`bg-slate-900 text-white rounded-xl border border-slate-700 shadow-md flex flex-col overflow-hidden ${
        isFullscreen ? 'fixed inset-4 z-50 shadow-2xl' : 'h-full'
      } ${className}`}
    >
      {/* Top Controls Toolbar */}
      <div className="px-3 py-2 bg-slate-800/90 border-b border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded bg-indigo-600/30 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
            <FileText className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-200 truncate text-[11px] sm:text-xs max-w-[140px] sm:max-w-[200px]">
                {invoice.fileName || 'Fatura Belgesi'}
              </span>
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded font-mono font-bold">
                {isPdf ? 'PDF (Canvas)' : 'GÖRSEL'}
              </span>
            </div>
          </div>
        </div>

        {/* Page Navigation for Multi-Page PDFs */}
        {isPdf && numPages > 1 && (
          <div className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-700">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              className="p-1 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
              title="Önceki Sayfa"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-slate-300 px-1">
              {currentPage} / {numPages}
            </span>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={currentPage >= numPages}
              className="p-1 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
              title="Sonraki Sayfa"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Zoom & Action Controls */}
        <div className="flex items-center gap-1">
          {docDataUrl && (
            <>
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 50}
                className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-30 cursor-pointer"
                title="Küçült"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="px-1.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-mono text-[11px] cursor-pointer"
                title="Yakınlaştırmayı Sıfırla (%100)"
              >
                %{zoomLevel}
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 300}
                className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-30 cursor-pointer"
                title="Büyüt"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRotate}
                className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                title="90° Döndür"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {docDataUrl && (
            <>
              <button
                type="button"
                onClick={handleOpenNewTab}
                className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                title="Yeni Sekmede Aç"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                title="Belgeyi İndir"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-indigo-300 cursor-pointer"
            title="Fatura PDF/Görseli Yeniden Ekle veya Değiştir"
          >
            <UploadCloud className="w-3.5 h-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            onChange={handleManualUpload}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer ml-1"
            title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran Önizle'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Document Content Area */}
      <div className="flex-1 bg-slate-950 overflow-auto relative flex items-center justify-center p-3 min-h-[300px]">
        {isLoading || isPdfRendering ? (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-10">
            <div className="bg-slate-900 border border-slate-700 px-4 py-3 rounded-xl shadow-xl flex items-center gap-3">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
              <span className="text-xs text-slate-200 font-medium">
                {isPdfRendering ? 'PDF Sayfası Çiziliyor...' : 'Fatura belgesi yükleniyor...'}
              </span>
            </div>
          </div>
        ) : null}

        {!docDataUrl ? (
          <div className="text-center p-6 max-w-sm">
            <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm">Belge Önizlemesi Bulunamadı</h4>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Bu faturanın orijinal PDF veya görsel dosyası tarayıcı hafızasında henüz kayıtlı değil.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <UploadCloud className="w-4 h-4" />
              <span>PDF / Görsel Ekle</span>
            </button>
          </div>
        ) : isPdf ? (
          /* Native Canvas-rendered PDF via PDF.js */
          <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
            {pdfError ? (
              <div className="text-center p-6 max-w-md bg-slate-900 border border-red-500/30 rounded-xl">
                <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                <h4 className="font-bold text-slate-200 text-sm">PDF Doğrudan Çizilemedi</h4>
                <p className="text-xs text-slate-400 mt-1 mb-3">{pdfError}</p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenNewTab}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Yeni Sekmede Aç</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>İndir</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative inline-block max-w-full">
                <canvas
                  ref={canvasRef}
                  className="bg-white shadow-2xl rounded-sm max-w-full h-auto transition-transform duration-150"
                  style={{
                    maxHeight: zoomLevel <= 100 ? 'calc(100vh - 250px)' : 'none',
                    objectFit: 'contain',
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          /* Interactive Image Viewer */
          <div
            className="w-full h-full flex items-center justify-center overflow-auto p-2"
            style={{ minHeight: '350px' }}
          >
            <img
              src={docDataUrl}
              alt={invoice.fileName || 'Fatura Görseli'}
              className="transition-transform duration-200 origin-center object-contain rounded shadow-lg select-none"
              style={{
                transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                maxWidth: zoomLevel <= 100 ? '100%' : 'none',
                maxHeight: zoomLevel <= 100 ? '100%' : 'none',
              }}
              draggable={false}
            />
          </div>
        )}
      </div>

      {/* Footer Info Strip */}
      <div className="px-3 py-1.5 bg-slate-800/80 border-t border-slate-700/80 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span className="truncate">
          Fatura No: <strong className="text-slate-200 font-mono">{invoice.metadata.faturaNo || '-'}</strong>
        </span>
        <span className="text-slate-500 font-mono">
          {invoice.metadata.faturaTarihi} • {invoice.items.length} Kalem {isPdf && numPages > 1 ? `• ${numPages} Sayfa` : ''}
        </span>
      </div>
    </div>
  );
};
