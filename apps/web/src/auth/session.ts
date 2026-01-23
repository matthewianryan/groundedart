import { apiFetch } from "../api/http";
import { getOrCreateDeviceId } from "./device";

export type AnonymousSessionResponse = {
  user_id: string;
  session_expires_at: string;
};

let inflight: Promise<AnonymousSessionResponse> | null = null;

export async function ensureAnonymousSession(): Promise<AnonymousSessionResponse> {
  if (inflight) return inflight;
  const deviceId = getOrCreateDeviceId();
  inflight = apiFetch<AnonymousSessionResponse>("/v1/sessions/anonymous", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId })
  });
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
