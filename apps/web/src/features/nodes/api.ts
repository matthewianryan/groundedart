import { apiFetch } from "../../api/http";
import type { NodesResponse } from "./types";

export function listNodes(bbox?: string) {
  const qs = bbox ? `?bbox=${encodeURIComponent(bbox)}` : "";
  return apiFetch<NodesResponse>(`/v1/nodes${qs}`);
}

