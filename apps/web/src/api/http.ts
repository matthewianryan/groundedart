export type ApiError = {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
};

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
    const body = (await res.json().catch(() => null)) as ApiError | null;
    if (body?.error?.message) throw new Error(`${body.error.code}: ${body.error.message}`);
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

