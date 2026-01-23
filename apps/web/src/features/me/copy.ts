import type { MeResponse, RankBreakdown } from "./types";

export function formatUnlockRequirement(currentRank: number, targetRank: number): string {
  const remaining = Math.max(0, targetRank - currentRank);
  const label = remaining === 1 ? "capture" : "captures";
  return `To unlock more, verify ${remaining} more ${label}.`;
}

export function formatNextUnlockLine(me: MeResponse): string | null {
  if (!me.next_unlock) return null;
  return formatUnlockRequirement(me.rank, me.next_unlock.min_rank);
}

export function formatRankCapsNotes(breakdown: RankBreakdown): string[] {
  const notes: string[] = [];
  if (breakdown.caps_applied.per_node_per_day > 0) {
    notes.push("Only one verified capture per node per day counts toward rank; try a new node or another day.");
  }
  if (breakdown.caps_applied.per_day_total > 0) {
    notes.push("Daily rank cap reached; more verified captures will count on a new day.");
  }
  return notes;
}
