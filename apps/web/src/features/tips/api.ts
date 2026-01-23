import { apiFetch } from "../../api/http";
import type { NodeTipsResponse, TipIntentResponse, TipReceiptPublic } from "./types";

export function createTipIntent(nodeId: string, amountLamports: number, init?: RequestInit) {
  return apiFetch<TipIntentResponse>("/v1/tips/intents", {
    method: "POST",
    body: JSON.stringify({ node_id: nodeId, amount_lamports: amountLamports }),
    ...init
  });
}

export function confirmTip(tipIntentId: string, txSignature: string, init?: RequestInit) {
  return apiFetch<TipReceiptPublic>("/v1/tips/confirm", {
    method: "POST",
    body: JSON.stringify({ tip_intent_id: tipIntentId, tx_signature: txSignature }),
    ...init
  });
}

export function getNodeTips(nodeId: string, init?: RequestInit) {
  return apiFetch<NodeTipsResponse>(`/v1/nodes/${nodeId}/tips`, init);
}
