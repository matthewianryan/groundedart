const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8000";

export function resolveMediaUrl(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, API_ORIGIN).toString();
  } catch {
    return trimmed;
  }
}
