import { ApiError, type ApiErrorPayload, apiFetch } from "../../api/http";

export type CapturePublic = {
  id: string;
  node_id: string;
  state: string;
  visibility: string;
  created_at: string;
  image_url: string | null;
  attribution_artist_name: string | null;
  attribution_artwork_title: string | null;
  attribution_source: string | null;
  attribution_source_url: string | null;
  rights_basis: string | null;
  rights_attested_at: string | null;
};

export type CapturesResponse = {
  captures: CapturePublic[];
};

export type CreateCaptureResponse = {
  capture: CapturePublic;
};

export type UploadCaptureImageResponse = CapturePublic;
export type UpdateCaptureResponse = CapturePublic;
export type PublishCaptureResponse = CapturePublic;

export type CaptureErrorCode =
  | "invalid_checkin_token"
  | "checkin_token_expired"
  | "capture_not_found"
  | "forbidden"
  | "auth_required"
  | "file_too_large"
  | "invalid_media_type"
  | "upload_incomplete"
  | "capture_rate_limited"
  | "insufficient_rank"
  | "pending_verification_cap_reached"
  | "capture_not_verified"
  | "capture_missing_attribution"
  | "capture_missing_rights";

export type CaptureErrorResponse = {
  error: { code: CaptureErrorCode; message: string; details: Record<string, unknown> };
};

export async function createCapture(body: {
  node_id: string;
  checkin_token: string;
  attribution_artist_name?: string;
  attribution_artwork_title?: string;
  attribution_source?: string;
  attribution_source_url?: string;
  rights_basis?: string;
  rights_attestation?: boolean;
}) {
  return apiFetch<CreateCaptureResponse>("/v1/captures", { method: "POST", body: JSON.stringify(body) });
}

export async function getCapture(captureId: string) {
  return apiFetch<CapturePublic>(`/v1/captures/${captureId}`);
}

export async function updateCapture(
  captureId: string,
  body: {
    attribution_artist_name?: string | null;
    attribution_artwork_title?: string | null;
    attribution_source?: string | null;
    attribution_source_url?: string | null;
    rights_basis?: string | null;
    rights_attestation?: boolean | null;
  }
) {
  return apiFetch<UpdateCaptureResponse>(`/v1/captures/${captureId}`, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}

export async function publishCapture(captureId: string) {
  return apiFetch<PublishCaptureResponse>(`/v1/captures/${captureId}/publish`, { method: "POST" });
}

export async function listNodeCaptures(nodeId: string, init?: RequestInit) {
  return apiFetch<CapturesResponse>(`/v1/nodes/${nodeId}/captures`, init);
}

export type UploadCaptureImageOptions = {
  signal?: AbortSignal;
  onProgress?: (loadedBytes: number, totalBytes?: number) => void;
  timeoutMs?: number;
};

function parseApiErrorPayload(text: string): ApiErrorPayload | null {
  try {
    const value = JSON.parse(text) as ApiErrorPayload;
    if (value && typeof value === "object" && "error" in value) return value;
  } catch {
    // ignore
  }
  return null;
}

async function uploadViaFetch(
  captureId: string,
  file: File,
  options?: UploadCaptureImageOptions
): Promise<UploadCaptureImageResponse> {
  const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8000";
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_ORIGIN}/v1/captures/${captureId}/image`, {
    method: "POST",
    body: form,
    credentials: "include",
    signal: options?.signal
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const payload = parseApiErrorPayload(bodyText);
    if (payload?.error?.code) throw new ApiError(payload.error, res.status);
    throw new ApiError({ code: "http_error", message: `HTTP ${res.status}` }, res.status);
  }
  return (await res.json()) as UploadCaptureImageResponse;
}

function uploadViaXhr(
  captureId: string,
  file: File,
  options?: UploadCaptureImageOptions
): Promise<UploadCaptureImageResponse> {
  const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8000";
  const url = `${API_ORIGIN}/v1/captures/${captureId}/image`;

  return new Promise<UploadCaptureImageResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.timeout = options?.timeoutMs ?? 0;

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (options?.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    const cleanup = () => {
      if (options?.signal) options.signal.removeEventListener("abort", onAbort);
    };

    if (options?.onProgress) {
      xhr.upload.onprogress = (event) => {
        options.onProgress?.(event.loaded, event.lengthComputable ? event.total : undefined);
      };
    }

    xhr.onerror = () => {
      cleanup();
      reject(new Error("Network error during upload"));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new Error("Upload timed out"));
    };

    xhr.onload = () => {
      cleanup();
      const status = xhr.status;
      const text = xhr.responseText ?? "";
      if (status >= 200 && status < 300) {
        try {
          resolve(JSON.parse(text) as UploadCaptureImageResponse);
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Invalid JSON response"));
        }
        return;
      }
      const payload = parseApiErrorPayload(text);
      if (payload?.error?.code) {
        reject(new ApiError(payload.error, status));
        return;
      }
      reject(new ApiError({ code: "http_error", message: `HTTP ${status}` }, status));
    };

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export async function uploadCaptureImage(
  captureId: string,
  file: File,
  options?: UploadCaptureImageOptions
): Promise<UploadCaptureImageResponse> {
  if (options?.onProgress) return uploadViaXhr(captureId, file, options);
  return uploadViaFetch(captureId, file, options);
}

export type RetryOptions = {
  maxAttempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function retryDelayMs(attempt: number, initialBackoffMs: number, maxBackoffMs: number): number {
  const exp = Math.min(maxBackoffMs, initialBackoffMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.round(exp * 0.2 * Math.random());
  return exp + jitter;
}

function shouldRetryUploadError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false;
  if (err instanceof ApiError) {
    if (err.status === 429) return true;
    return err.status >= 500;
  }
  return true;
}

export async function uploadCaptureImageWithRetry(
  captureId: string,
  file: File,
  options?: UploadCaptureImageOptions & RetryOptions
): Promise<UploadCaptureImageResponse> {
  const maxAttempts = options?.maxAttempts ?? 6;
  const initialBackoffMs = options?.initialBackoffMs ?? 750;
  const maxBackoffMs = options?.maxBackoffMs ?? 30_000;

  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await uploadCaptureImage(captureId, file, options);
    } catch (err) {
      if (attempt >= maxAttempts || !shouldRetryUploadError(err)) throw err;
      await sleep(retryDelayMs(attempt, initialBackoffMs, maxBackoffMs), options?.signal);
    }
  }
}
