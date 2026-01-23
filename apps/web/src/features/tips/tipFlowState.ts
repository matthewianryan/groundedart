import { isApiError } from "../../api/http";
import type { Transaction } from "@solana/web3.js";
import type { TipIntentResponse, TipReceiptPublic } from "./types";

export type TipFlowStatus =
  | "needs_wallet"
  | "ready"
  | "sending"
  | "confirming"
  | "success"
  | "failure";

export type TipFlowError = {
  title: string;
  detail?: string;
};

export type TipFlowState = {
  status: TipFlowStatus;
  amountLamports: number | null;
  tipIntent: TipIntentResponse | null;
  txSignature: string | null;
  receipt: TipReceiptPublic | null;
  error: TipFlowError | null;
};

export type TipFlowAction =
  | { type: "wallet_connected" }
  | { type: "wallet_disconnected" }
  | { type: "amount_selected"; amountLamports: number }
  | { type: "intent_requested" }
  | { type: "intent_created"; intent: TipIntentResponse }
  | { type: "tx_sent"; signature: string }
  | { type: "confirm_requested" }
  | { type: "confirm_succeeded"; receipt: TipReceiptPublic }
  | { type: "failed"; error: TipFlowError }
  | { type: "reset" };

export type TipFlowDeps = {
  createTipIntent: (nodeId: string, amountLamports: number) => Promise<TipIntentResponse>;
  confirmTip: (tipIntentId: string, txSignature: string) => Promise<TipReceiptPublic>;
  buildTransaction: (intent: TipIntentResponse) => Transaction;
  sendTransaction: (transaction: Transaction) => Promise<string>;
};

export function createTipFlowState(walletConnected: boolean): TipFlowState {
  return {
    status: walletConnected ? "ready" : "needs_wallet",
    amountLamports: null,
    tipIntent: null,
    txSignature: null,
    receipt: null,
    error: null
  };
}

export function tipFlowReducer(state: TipFlowState, action: TipFlowAction): TipFlowState {
  switch (action.type) {
    case "wallet_connected":
      if (state.status !== "needs_wallet") return state;
      return { ...state, status: "ready", error: null };
    case "wallet_disconnected":
      return createTipFlowState(false);
    case "amount_selected":
      return {
        ...state,
        amountLamports: action.amountLamports,
        status: state.status === "needs_wallet" ? "needs_wallet" : "ready",
        error: null
      };
    case "intent_requested":
      return { ...state, status: "sending", error: null, receipt: null };
    case "intent_created":
      return { ...state, tipIntent: action.intent, error: null };
    case "tx_sent":
      return { ...state, txSignature: action.signature, error: null };
    case "confirm_requested":
      return { ...state, status: "confirming", error: null };
    case "confirm_succeeded":
      return { ...state, status: "success", receipt: action.receipt, error: null };
    case "failed":
      return { ...state, status: "failure", error: action.error };
    case "reset":
      return createTipFlowState(true);
    default:
      return state;
  }
}

function toTipFlowError(error: unknown): TipFlowError {
  if (isApiError(error)) {
    return { title: "Tip failed", detail: error.message || error.code };
  }
  if (error instanceof Error) {
    return { title: "Tip failed", detail: error.message };
  }
  return { title: "Tip failed", detail: "Unknown error" };
}

export async function performTipFlow(params: {
  nodeId: string;
  amountLamports: number | null;
  state: TipFlowState;
  deps: TipFlowDeps;
  onState?: (state: TipFlowState) => void;
}): Promise<TipFlowState> {
  let current = params.state;

  const transition = (action: TipFlowAction) => {
    current = tipFlowReducer(current, action);
    params.onState?.(current);
  };

  if (!params.amountLamports || params.amountLamports <= 0) {
    transition({
      type: "failed",
      error: { title: "Select an amount", detail: "Choose a tip amount to continue." }
    });
    return current;
  }

  if (current.status === "needs_wallet") {
    transition({
      type: "failed",
      error: { title: "Wallet required", detail: "Connect a wallet to send a tip." }
    });
    return current;
  }

  try {
    transition({ type: "intent_requested" });
    const intent = await params.deps.createTipIntent(params.nodeId, params.amountLamports);
    transition({ type: "intent_created", intent });

    const transaction = params.deps.buildTransaction(intent);
    const signature = await params.deps.sendTransaction(transaction);
    transition({ type: "tx_sent", signature });
    transition({ type: "confirm_requested" });

    const receipt = await params.deps.confirmTip(intent.tip_intent_id, signature);
    transition({ type: "confirm_succeeded", receipt });
  } catch (error) {
    transition({ type: "failed", error: toTipFlowError(error) });
  }

  return current;
}
