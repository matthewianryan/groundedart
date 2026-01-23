import { apiFetch } from "../../api/http";
import type { NodePublic, NodesResponse } from "./types";

export function listNodes(bbox?: string, init?: RequestInit) {
  const qs = bbox ? `?bbox=${encodeURIComponent(bbox)}` : "";
  return apiFetch<NodesResponse>(`/v1/nodes${qs}`, init);
}

export function getNode(nodeId: string, init?: RequestInit) {
  return apiFetch<NodePublic>(`/v1/nodes/${nodeId}`, init);
}
