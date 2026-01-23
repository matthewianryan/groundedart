import { apiFetch } from "../../api/http";

export type CheckinChallengeResponse = { challenge_id: string; expires_at: string };
export type CheckinRequest = { challenge_id: string; lat: number; lng: number; accuracy_m: number };
export type CheckinResponse = { checkin_token: string; expires_at: string };
export type CheckinErrorCode =
  | "node_not_found"
  | "invalid_challenge"
  | "challenge_used"
  | "challenge_expired"
  | "checkin_challenge_rate_limited"
  | "location_accuracy_too_low"
  | "outside_geofence"
  | "capture_rate_limited"
  | "insufficient_rank";
export type CheckinErrorDetails = {
  accuracy_m?: number;
  max_allowed_m?: number;
  radius_m?: number;
  distance_m?: number;
};

export function createCheckinChallenge(nodeId: string) {
  return apiFetch<CheckinChallengeResponse>(`/v1/nodes/${nodeId}/checkins/challenge`, { method: "POST" });
}

export function checkIn(nodeId: string, body: CheckinRequest) {
  return apiFetch<CheckinResponse>(`/v1/nodes/${nodeId}/checkins`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}
