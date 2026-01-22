import { apiFetch } from "../../api/http";

export type CheckinChallengeResponse = { challenge_id: string; expires_at: string };
export type CheckinResponse = { checkin_token: string; expires_at: string };

export function createCheckinChallenge(nodeId: string) {
  return apiFetch<CheckinChallengeResponse>(`/v1/nodes/${nodeId}/checkins/challenge`, { method: "POST" });
}

export function checkIn(nodeId: string, body: { challenge_id: string; lat: number; lng: number; accuracy_m: number }) {
  return apiFetch<CheckinResponse>(`/v1/nodes/${nodeId}/checkins`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

