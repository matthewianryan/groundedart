import { apiFetch } from "../../api/http";

export type CreateCaptureResponse = {
  capture: { id: string; node_id: string; state: string; created_at: string; image_url?: string | null };
};

export async function createCapture(body: {
  node_id: string;
  checkin_token: string;
  attribution_artist_name?: string;
  attribution_artwork_title?: string;
}) {
  return apiFetch<CreateCaptureResponse>("/v1/captures", { method: "POST", body: JSON.stringify(body) });
}

export async function uploadCaptureImage(captureId: string, file: File) {
  const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8000";
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_ORIGIN}/v1/captures/${captureId}/image`, {
    method: "POST",
    body: form,
    credentials: "include"
  });
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
  return (await res.json()) as {
    id: string;
    node_id: string;
    state: string;
    created_at: string;
    image_url?: string | null;
  };
}

