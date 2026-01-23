import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { buildTipTransaction } from "./transaction";
import { confirmTip, createTipIntent, getNodeTips } from "./api";
import type { NodeTipsResponse, TipReceiptStatus } from "./types";
import { createTipFlowState, performTipFlow, tipFlowReducer, type TipFlowState } from "./tipFlowState";

const LAMPORTS_PER_SOL = 1_000_000_000;

const TIP_AMOUNTS = [
  { label: "0.01 SOL", lamports: 10_000_000 },
  { label: "0.05 SOL", lamports: 50_000_000 },
  { label: "0.10 SOL", lamports: 100_000_000 }
];

function formatLamports(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(2);
}

function formatReceiptStatus(status: TipReceiptStatus): string {
  if (status === "seen") return "Seen on-chain";
  if (status === "confirmed") return "Confirmed";
  if (status === "finalized") return "Finalized";
  return "Failed";
}

function shortenSignature(signature: string): string {
  if (signature.length <= 12) return signature;
  return `${signature.slice(0, 6)}…${signature.slice(-4)}`;
}

type TipFlowProps = {
  nodeId: string;
  nodeName?: string;
};

export function TipFlow({ nodeId }: TipFlowProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = useState<TipFlowState>(() => createTipFlowState(wallet.connected));
  const [tipsSummary, setTipsSummary] = useState<NodeTipsResponse | null>(null);
  const [tipsError, setTipsError] = useState<string | null>(null);

  const isBusy = state.status === "sending" || state.status === "confirming";
  const amountOptions = useMemo(() => TIP_AMOUNTS, []);

  useEffect(() => {
    setState((prev) =>
      tipFlowReducer(prev, { type: wallet.connected ? "wallet_connected" : "wallet_disconnected" })
    );
  }, [wallet.connected]);

  useEffect(() => {
    if (!nodeId) return;
    const controller = new AbortController();
    setTipsError(null);
    getNodeTips(nodeId, { signal: controller.signal })
      .then((res) => setTipsSummary(res))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setTipsError("Unable to load tip totals.");
      });
    return () => controller.abort();
  }, [nodeId]);

  async function handleSend() {
    if (!wallet.publicKey) {
      setState((prev) =>
        tipFlowReducer(prev, {
          type: "failed",
          error: { title: "Wallet required", detail: "Connect a wallet to send a tip." }
        })
      );
      return;
    }

    const result = await performTipFlow({
      nodeId,
      amountLamports: state.amountLamports,
      state,
      deps: {
        createTipIntent,
        confirmTip,
        buildTransaction: (intent) => buildTipTransaction(intent, wallet.publicKey!),
        sendTransaction: (transaction) => wallet.sendTransaction(transaction, connection)
      },
      onState: setState
    });

    if (result.status === "success") {
      const refreshed = await getNodeTips(nodeId).catch(() => null);
      if (refreshed) {
        setTipsSummary(refreshed);
      }
    }
  }

  function resetFlow() {
    setState((prev) => tipFlowReducer(prev, { type: "reset" }));
  }

  const canSend = wallet.connected && !isBusy && !!state.amountLamports && state.status === "ready";

  return (
    <div className="tip-card">
      {tipsSummary ? (
        <div className="tip-summary">
          <div>
            Total tips: <strong>{tipsSummary.total_amount_sol} SOL</strong>
          </div>
          {tipsSummary.recent_receipts.length > 0 ? (
            <div className="tip-receipts">
              {tipsSummary.recent_receipts.slice(0, 3).map((receipt) => (
                <div key={receipt.tx_signature} className="tip-receipt-row">
                  <span>{formatReceiptStatus(receipt.confirmation_status)}</span>
                  <span className="muted">{shortenSignature(receipt.tx_signature)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">Be the first to tip this artist.</div>
          )}
        </div>
      ) : tipsError ? (
        <div className="muted">{tipsError}</div>
      ) : (
        <div className="muted">Loading tip totals…</div>
      )}

      {wallet.connected ? (
        <div className="tip-form">
          <div className="tip-label">Choose an amount</div>
          <div className="tip-amounts">
            {amountOptions.map((amount) => (
              <button
                key={amount.label}
                type="button"
                className={`tip-amount${state.amountLamports === amount.lamports ? " selected" : ""}`}
                onClick={() =>
                  setState((prev) =>
                    tipFlowReducer(prev, { type: "amount_selected", amountLamports: amount.lamports })
                  )
                }
                disabled={isBusy}
              >
                {amount.label}
              </button>
            ))}
          </div>
          <div className="tip-actions">
            <button type="button" onClick={handleSend} disabled={!canSend}>
              {state.status === "sending"
                ? "Sending…"
                : state.status === "confirming"
                  ? "Confirming…"
                  : state.amountLamports
                    ? `Send ${formatLamports(state.amountLamports)} SOL`
                    : "Send tip"}
            </button>
            <WalletMultiButton className="tip-wallet-button" />
          </div>
        </div>
      ) : (
        <div className="tip-form">
          <div className="tip-label">Connect a Solana wallet to tip.</div>
          <WalletMultiButton className="tip-wallet-button" />
        </div>
      )}

      {state.status === "confirming" ? (
        <div className="tip-status">
          Waiting for confirmation… Your wallet should show the transaction as sent.
        </div>
      ) : null}

      {state.status === "success" && state.receipt ? (
        <div className="tip-status">
          <div>
            Receipt status: <strong>{formatReceiptStatus(state.receipt.confirmation_status)}</strong>
          </div>
          <div className="muted">Tx: {shortenSignature(state.receipt.tx_signature)}</div>
          {state.receipt.confirmation_status === "seen" ||
          state.receipt.confirmation_status === "confirmed" ? (
            <div className="muted">Finalization may update later.</div>
          ) : null}
          <button type="button" onClick={resetFlow}>
            Send another tip
          </button>
        </div>
      ) : null}

      {state.status === "failure" && state.error ? (
        <div className="alert">
          <strong>{state.error.title}</strong>
          {state.error.detail ? <div className="muted">{state.error.detail}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
