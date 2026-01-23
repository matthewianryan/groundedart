export type PersistedUploadStatus = "pending" | "uploading" | "failed";

export type PersistedUploadIntent = {
  captureId: string;
  createdAt: string;
  updatedAt: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  status: PersistedUploadStatus;
  attemptCount: number;
  nextAttemptAt?: string;
  lastError?: { message: string; code?: string; status?: number };
};

const DB_NAME = "groundedart";
const DB_VERSION = 1;
const STORE_NAME = "capture_upload_intents";

let dbPromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openUploadDb();
  const tx = db.transaction(STORE_NAME, mode);
  const store = tx.objectStore(STORE_NAME);
  const result = await requestToPromise(fn(store));
  await txDone(tx);
  return result;
}

export async function openUploadDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (!("indexedDB" in window)) {
    throw new Error("IndexedDB is unavailable in this browser environment.");
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "captureId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });

  return dbPromise;
}

export async function putUploadIntent(intent: PersistedUploadIntent): Promise<void> {
  await withStore("readwrite", (store) => store.put(intent));
}

export async function getUploadIntent(captureId: string): Promise<PersistedUploadIntent | null> {
  const res = await withStore("readonly", (store) => store.get(captureId));
  return (res as PersistedUploadIntent | undefined) ?? null;
}

export async function deleteUploadIntent(captureId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(captureId));
}

export async function listUploadIntents(): Promise<PersistedUploadIntent[]> {
  const db = await openUploadDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);

  const intents: PersistedUploadIntent[] = [];
  await new Promise<void>((resolve, reject) => {
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) {
        resolve();
        return;
      }
      intents.push(cursor.value as PersistedUploadIntent);
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error ?? new Error("IndexedDB cursor failed"));
  });

  await txDone(tx);
  intents.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return intents;
}

