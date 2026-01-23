import { apiFetch } from "../../api/http";

export type AdminCaptureTransitionTargetState = "verified" | "rejected" | "hidden";

export async function adminTransitionCapture(
  captureId: string,
  adminToken: string,
  body: {
    target_state: AdminCaptureTransitionTargetState;
    reason_code?: string | null;
    details?: Record<string, unknown> | null;
  }
) {
  return apiFetch<{ capture: { id: string; state: string } }>(`/v1/admin/captures/${captureId}/transition`, {
    method: "POST",
    headers: {
      "X-Admin-Token": adminToken
    },
    body: JSON.stringify(body)
  });
}

