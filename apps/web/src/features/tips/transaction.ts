import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { TipIntentResponse } from "./types";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export function buildTipTransaction(intent: TipIntentResponse, fromPubkey: PublicKey): Transaction {
  if (intent.cluster !== "devnet") {
    throw new Error(`Unsupported cluster: ${intent.cluster}`);
  }

  const toPubkey = new PublicKey(intent.to_pubkey);
  const transaction = new Transaction();

  transaction.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports: intent.amount_lamports
    })
  );

  transaction.add(
    new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: new TextEncoder().encode(intent.memo_text) as unknown as Buffer
    })
  );

  return transaction;
}
