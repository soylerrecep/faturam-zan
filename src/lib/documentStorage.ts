/**
 * IndexedDB helper for storing large invoice PDF and Image Data URLs
 * safely without hitting localStorage 5MB quota.
 */

const DB_NAME = 'fatura_documents_db';
const DB_VERSION = 1;
const STORE_NAME = 'invoice_files';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'invoiceId' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

export async function saveInvoiceDocument(invoiceId: string, dataUrl: string, fileName?: string): Promise<void> {
  if (!invoiceId || !dataUrl) return;
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({
        invoiceId,
        dataUrl,
        fileName: fileName || '',
        updatedAt: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveInvoiceDocument error, using memory fallback:', err);
  }
}

export async function getInvoiceDocument(invoiceId: string): Promise<string | null> {
  if (!invoiceId) return null;
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(invoiceId);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result?.dataUrl || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('IndexedDB getInvoiceDocument error:', err);
    return null;
  }
}

export async function deleteInvoiceDocument(invoiceId: string): Promise<void> {
  if (!invoiceId) return;
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(invoiceId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('IndexedDB deleteInvoiceDocument error:', err);
  }
}

export async function clearAllInvoiceDocuments(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('IndexedDB clearAllInvoiceDocuments error:', err);
  }
}
