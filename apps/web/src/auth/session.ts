import { apiFetch } from "../api/http";
import { getOrCreateDeviceId } from "./device";

export type AnonymousSessionResponse = {
  user_id: string;
  session_expires_at: string;
};

export async function ensureAnonymousSession(): Promise<AnonymousSessionResponse> {
  const deviceId = getOrCreateDeviceId();
  return apiFetch<AnonymousSessionResponse>("/v1/sessions/anonymous", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId })
  });
}

