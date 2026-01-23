export type TipIntentResponse = {
  tip_intent_id: string;
  to_pubkey: string;
  amount_lamports: number;
  cluster: "devnet";
  memo_text: string;
};

export type TipReceiptStatus = "seen" | "confirmed" | "finalized" | "failed";

export type TipReceiptPublic = {
  tip_intent_id: string;
  tx_signature: string;
  from_pubkey?: string | null;
  to_pubkey: string;
  amount_lamports: number;
  slot?: number | null;
  block_time?: string | null;
  confirmation_status: TipReceiptStatus;
  first_seen_at: string;
  last_checked_at: string;
  failure_reason?: string | null;
};

export type NodeTipsResponse = {
  node_id: string;
  total_amount_lamports: number;
  total_amount_sol: string;
  recent_receipts: TipReceiptPublic[];
};
