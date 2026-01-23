export type CaptureDraft = {
  id: string;
  nodeId: string;
  nodeName?: string | null;
  checkinToken: string;
  capturedAt: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
};

const DB_NAME = "groundedart_capture_drafts";
const DB_VERSION = 1;
const STORE_NAME = "drafts";
const ACTIVE_DRAFT_ID = "active";

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

async function openDraftDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (!("indexedDB" in window)) {
    throw new Error("IndexedDB is unavailable in this browser environment.");
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });

  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDraftDb();
  const tx = db.transaction(STORE_NAME, mode);
  const store = tx.objectStore(STORE_NAME);
  const result = await requestToPromise(fn(store));
  await txDone(tx);
  return result;
}

export async function saveActiveCaptureDraft(draft: Omit<CaptureDraft, "id">): Promise<void> {
  await withStore("readwrite", (store) => store.put({ ...draft, id: ACTIVE_DRAFT_ID }));
}

export async function loadActiveCaptureDraft(): Promise<CaptureDraft | null> {
  const result = await withStore("readonly", (store) => store.get(ACTIVE_DRAFT_ID));
  return (result as CaptureDraft | undefined) ?? null;
}

export async function clearActiveCaptureDraft(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(ACTIVE_DRAFT_ID));
}
