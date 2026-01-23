export type ApiErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export class ApiError extends Error {
  code: string;
  details: Record<string, unknown>;
  status: number;

  constructor(payload: ApiErrorPayload["error"], status: number) {
    super(payload.message ?? "API error");
    this.name = "ApiError";
    this.code = payload.code;
    this.details = payload.details ?? {};
    this.status = status;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8000";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorPayload | null;
    if (body?.error?.code) {
      throw new ApiError(body.error, res.status);
    }
    throw new ApiError({ code: "http_error", message: `HTTP ${res.status}` }, res.status);
  }
  return (await res.json()) as T;
}
