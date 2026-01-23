export type RankBreakdownCaps = {
  per_node_per_day: number;
  per_day_total: number;
};

export type RankBreakdown = {
  points_total: number;
  verified_captures_total: number;
  verified_captures_counted: number;
  caps_applied: RankBreakdownCaps;
};

export type NextUnlock = {
  min_rank: number;
  summary: string;
  unlocks: string[];
};

export type MeResponse = {
  user_id: string;
  rank: number;
  rank_version: string;
  rank_breakdown: RankBreakdown;
  next_unlock: NextUnlock | null;
};
