import { isApiError } from "../../api/http";
import { adminTransitionCapture } from "../admin/api";
import { uploadCaptureImage, type UploadCaptureImageOptions } from "./api";
import { dispatchCaptureUploadedEvent, dispatchCaptureVerifiedEvent } from "./uploadEvents";
import {
  deleteUploadIntent,
  listUploadIntents,
  putUploadIntent,
  type PersistedUploadIntent,
  type PersistedUploadStatus
} from "./indexedDb";

export type UploadQueueStatus = PersistedUploadStatus;

export type UploadQueueItemView = Omit<PersistedUploadIntent, "blob"> & {
  progress?: { loaded: number; total?: number };
};

export type UploadQueueSnapshot = {
  initialized: boolean;
  items: UploadQueueItemView[];
  persistenceError?: string;
};

type InternalItem = PersistedUploadIntent & {
  progress?: { loaded: number; total?: number };
};

type Listener = (snapshot: UploadQueueSnapshot) => void;

const MAX_AUTO_ATTEMPTS = 6;
const INITIAL_BACKOFF_MS = 750;
const MAX_BACKOFF_MS = 30_000;

const DEMO_ENABLED_STORAGE_KEY = "groundedart.demo.enabled";
const DEMO_ADMIN_TOKEN_STORAGE_KEY = "groundedart.demo.adminToken";
const DEMO_AUTO_VERIFY_STORAGE_KEY = "groundedart.demo.autoVerify";

function nowIso() {
  return new Date().toISOString();
}

function readStorageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function isDemoEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  if (query.has("demo")) return true;
  return readStorageValue(DEMO_ENABLED_STORAGE_KEY) === "true";
}

function getDemoAdminToken(): string | null {
  const fromEnv = import.meta.env.VITE_ADMIN_API_TOKEN as string | undefined;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const stored = readStorageValue(DEMO_ADMIN_TOKEN_STORAGE_KEY);
  return stored?.trim() ? stored.trim() : null;
}

function shouldAutoVerify(): boolean {
  return readStorageValue(DEMO_AUTO_VERIFY_STORAGE_KEY) !== "false";
}

async function maybeAutoVerifyCapture(captureId: string): Promise<void> {
  if (!isDemoEnabled()) return;
  if (!shouldAutoVerify()) return;
  const token = getDemoAdminToken();
  if (!token) return;
  try {
    await adminTransitionCapture(captureId, token, {
      target_state: "verified",
      details: { demo_auto_verify: true }
    });
    dispatchCaptureVerifiedEvent(captureId);
  } catch {
    // Ignore auto-verify failures; the demo can still proceed with manual moderation.
  }
}

function parseIsoMs(value?: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function computeBackoffDelayMs(attemptCount: number): number {
  const exp = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** Math.max(0, attemptCount - 1));
  const jitter = Math.round(exp * 0.2 * Math.random());
  return exp + jitter;
}

function toView(item: InternalItem): UploadQueueItemView {
  const { blob: _blob, ...rest } = item;
  return rest;
}

function toPersisted(item: InternalItem): PersistedUploadIntent {
  const { progress: _progress, ...persisted } = item;
  return persisted;
}

function classifyUploadError(err: unknown): { message: string; code?: string; status?: number; retryable: boolean } {
  if (isApiError(err)) {
    const retryable = err.status >= 500 || err.status === 429;
    return { message: err.message, code: err.code, status: err.status, retryable };
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return { message: "Upload aborted", retryable: false };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { message, retryable: true };
}

export class UploadQueue {
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private items = new Map<string, InternalItem>();
  private listeners = new Set<Listener>();
  private persistenceError: string | undefined;
  private activeCaptureId: string | null = null;
  private timer: number | null = null;

  constructor() {
    window.addEventListener("online", () => this.kick());
  }

  getSnapshot(): UploadQueueSnapshot {
    const items = Array.from(this.items.values())
      .map(toView)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { initialized: this.initialized, items, persistenceError: this.persistenceError };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      try {
        const persisted = await listUploadIntents();
        for (const item of persisted) {
          const status: PersistedUploadStatus = item.status === "uploading" ? "pending" : item.status;
          this.items.set(item.captureId, { ...item, status });
        }
        this.persistenceError = undefined;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.persistenceError = message;
      } finally {
        this.initialized = true;
        this.initializing = null;
        this.emit();
        this.kick();
      }
    })();

    return this.initializing;
  }

  async enqueue(intent: {
    captureId: string;
    blob: Blob;
    fileName: string;
    mimeType: string;
    createdAt?: string;
  }): Promise<void> {
    await this.ensureInitialized();
    if (this.items.has(intent.captureId)) return;

    const createdAt = intent.createdAt ?? nowIso();
    const record: InternalItem = {
      captureId: intent.captureId,
      createdAt,
      updatedAt: createdAt,
      blob: intent.blob,
      fileName: intent.fileName,
      mimeType: intent.mimeType,
      size: intent.blob.size,
      status: "pending",
      attemptCount: 0
    };

    this.items.set(record.captureId, record);
    this.emit();

    try {
      await putUploadIntent(record);
      this.persistenceError = undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.persistenceError = message;
      record.status = "failed";
      record.lastError = { message: `Could not persist upload intent: ${message}` };
      record.updatedAt = nowIso();
      this.emit();
      throw err;
    }

    this.kick();
  }

  async retryNow(captureId: string): Promise<void> {
    await this.ensureInitialized();
    const item = this.items.get(captureId);
    if (!item) return;
    item.status = "pending";
    item.attemptCount = 0;
    item.nextAttemptAt = undefined;
    item.updatedAt = nowIso();
    await putUploadIntent(item);
    this.emit();
    this.kick();
  }

  async remove(captureId: string): Promise<void> {
    await this.ensureInitialized();
    this.items.delete(captureId);
    this.emit();
    await deleteUploadIntent(captureId);
    this.kick();
  }

  private clearTimer() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleKick(ms: number) {
    this.clearTimer();
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.kick();
    }, ms);
  }

  private kick() {
    this.clearTimer();
    void this.pump();
  }

  private nextEligibleItem(nowMs: number): InternalItem | null {
    for (const item of this.items.values()) {
      if (item.status !== "pending") continue;
      const nextMs = parseIsoMs(item.nextAttemptAt);
      if (nextMs === null || nextMs <= nowMs) return item;
    }
    return null;
  }

  private scheduleNextAttempt(nowMs: number) {
    let nextMs: number | null = null;
    for (const item of this.items.values()) {
      if (item.status !== "pending") continue;
      const attemptMs = parseIsoMs(item.nextAttemptAt);
      if (attemptMs === null) {
        nextMs = nowMs;
        break;
      }
      nextMs = nextMs === null ? attemptMs : Math.min(nextMs, attemptMs);
    }
    if (nextMs === null) return;
    const delay = Math.max(0, nextMs - nowMs);
    this.scheduleKick(delay);
  }

  private async pump(): Promise<void> {
    await this.ensureInitialized();
    if (this.activeCaptureId) return;

    const nowMs = Date.now();
    if (!navigator.onLine) {
      this.scheduleKick(1000);
      return;
    }

    const item = this.nextEligibleItem(nowMs);
    if (!item) {
      this.scheduleNextAttempt(nowMs);
      return;
    }

    this.activeCaptureId = item.captureId;
    item.status = "uploading";
    item.updatedAt = nowIso();
    item.progress = { loaded: 0, total: item.size };
    await putUploadIntent(toPersisted(item));
    this.emit();

    const options: UploadCaptureImageOptions = {
      onProgress: (loaded, total) => {
        const current = this.items.get(item.captureId);
        if (!current) return;
        if (current.status !== "uploading") return;
        current.progress = { loaded, total };
        this.emit();
      }
    };

    try {
      const file = new File([item.blob], item.fileName, { type: item.mimeType });
      await uploadCaptureImage(item.captureId, file, options);
      this.items.delete(item.captureId);
      await deleteUploadIntent(item.captureId);
      dispatchCaptureUploadedEvent(item.captureId);
      void maybeAutoVerifyCapture(item.captureId);
      this.emit();
    } catch (err) {
      const classified = classifyUploadError(err);
      const current = this.items.get(item.captureId);
      if (current) {
        current.updatedAt = nowIso();
        current.progress = undefined;
        current.lastError = {
          message: classified.message,
          code: classified.code,
          status: classified.status
        };

        if (!classified.retryable) {
          current.status = "failed";
          current.nextAttemptAt = undefined;
        } else if (current.attemptCount + 1 >= MAX_AUTO_ATTEMPTS) {
          current.status = "failed";
          current.nextAttemptAt = undefined;
        } else {
          current.status = "pending";
          current.attemptCount += 1;
          const delay = computeBackoffDelayMs(current.attemptCount);
          current.nextAttemptAt = new Date(Date.now() + delay).toISOString();
        }

        await putUploadIntent(toPersisted(current));
        this.emit();
      }
    } finally {
      this.activeCaptureId = null;
      this.kick();
    }
  }
}

let singleton: UploadQueue | null = null;
export function getUploadQueue(): UploadQueue {
  if (!singleton) singleton = new UploadQueue();
  return singleton;
}
