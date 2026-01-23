import { describe, expect, it, vi } from "vitest";
import { Transaction } from "@solana/web3.js";
import { createTipFlowState, performTipFlow } from "./tipFlowState";
import type { TipIntentResponse, TipReceiptPublic } from "./types";

const intent: TipIntentResponse = {
  tip_intent_id: "11111111-1111-1111-1111-111111111111",
  to_pubkey: "4Nd1m6WnQ1yMJJGx7JizZ3chx7EAFhcbuFZ6g7e1Pi2m",
  amount_lamports: 1000,
  cluster: "devnet",
  memo_text: "tip_intent_id=11111111-1111-1111-1111-111111111111"
};

const receipt: TipReceiptPublic = {
  tip_intent_id: intent.tip_intent_id,
  tx_signature: "sig-123",
  from_pubkey: "from-1",
  to_pubkey: intent.to_pubkey,
  amount_lamports: intent.amount_lamports,
  slot: 123,
  block_time: "2024-01-01T00:00:00Z",
  confirmation_status: "seen",
  first_seen_at: "2024-01-01T00:00:01Z",
  last_checked_at: "2024-01-01T00:00:02Z",
  failure_reason: null
};

describe("performTipFlow", () => {
  it("executes the happy path and records transitions", async () => {
    const createTipIntent = vi.fn().mockResolvedValue(intent);
    const confirmTip = vi.fn().mockResolvedValue(receipt);
    const buildTransaction = vi.fn().mockReturnValue(new Transaction());
    const sendTransaction = vi.fn().mockResolvedValue(receipt.tx_signature);
    const statuses: string[] = [];

    const result = await performTipFlow({
      nodeId: "node-1",
      amountLamports: intent.amount_lamports,
      state: createTipFlowState(true),
      deps: { createTipIntent, confirmTip, buildTransaction, sendTransaction },
      onState: (state) => statuses.push(state.status)
    });

    expect(createTipIntent).toHaveBeenCalledWith("node-1", intent.amount_lamports);
    expect(confirmTip).toHaveBeenCalledWith(intent.tip_intent_id, receipt.tx_signature);
    expect(buildTransaction).toHaveBeenCalledWith(intent);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
    expect(result.receipt?.tx_signature).toBe(receipt.tx_signature);
    expect(statuses).toContain("sending");
    expect(statuses).toContain("confirming");
  });

  it("handles confirmation failures", async () => {
    const createTipIntent = vi.fn().mockResolvedValue(intent);
    const confirmTip = vi.fn().mockRejectedValue(new Error("RPC error"));
    const buildTransaction = vi.fn().mockReturnValue(new Transaction());
    const sendTransaction = vi.fn().mockResolvedValue(receipt.tx_signature);

    const result = await performTipFlow({
      nodeId: "node-2",
      amountLamports: intent.amount_lamports,
      state: createTipFlowState(true),
      deps: { createTipIntent, confirmTip, buildTransaction, sendTransaction }
    });

    expect(result.status).toBe("failure");
    expect(result.error?.detail).toBe("RPC error");
  });
});
