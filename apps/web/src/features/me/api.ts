import { apiFetch } from "../../api/http";
import type { MeResponse } from "./types";

export function getMe(init?: RequestInit) {
  return apiFetch<MeResponse>("/v1/me", init);
}
