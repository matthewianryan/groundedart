# Rank + Gating (MVP)

This document defines the MVP rank model and the API gating policy. The goal is a simple,
auditable system derived from verified actions only.

## Rank model (version: v1_points)

### Actions that generate rank
- Verified captures only. A rank event is emitted when a capture transitions to `verified`.
- Other actions (check-ins, uploads, drafts) do not affect rank.

### Event log + computation
- Rank events are append-only.
- Rank is computed from rank events whose captures are still verified.
- Computation steps (per user):
  1. Start with all `capture_verified` events.
  2. Exclude events whose capture is no longer `verified`.
  3. Group by `(node_id, UTC day)` and keep at most 1 event per node per day.
  4. Apply a per-user daily cap of 3 points (UTC day).
  5. Rank is the sum of remaining points across all time.

### Materialization (performance)
To avoid scanning all rank events on hot read paths, we materialize:
- `curator_rank_daily`: per-user per-day aggregates (post caps).
- `curator_rank_cache`: per-user snapshot totals used for gating and `/v1/me`.

Rank remains canonically derived from `rank_events` (materialization is a cache that can be rebuilt).

### Rank event identity + idempotency (deterministic)
Rank event writes must be **retry-safe**: if the same semantic event is submitted more than once (client retry, job replay),
it must not double-count.

Each rank event therefore has a **deterministic identity** derived from its defining attributes. The DB enforces uniqueness
on this identity so repeated inserts become no-ops.

#### Canonical identity inputs
The identity is the canonical JSON object:
- `v`: integer identity schema version (currently `1`)
- `event_type`: lowercased string (e.g. `capture_verified`)
- `rank_version`: lowercased string (e.g. `v1_points`)
- `user_id`: UUID string (lowercase)
- `source_kind`: lowercased string (e.g. `capture`, `node`, `system`)
- `source_id`: string (UUID string lowercase when applicable)
- `attributes` (optional): event-type-specific stable attributes (JSON object)

#### Normalization rules
- `event_type`, `rank_version`, `source_kind`: `strip()` then lowercase.
- UUIDs: canonical lowercase string form (e.g. `550e8400-e29b-41d4-a716-446655440000`).
- `attributes`: omit keys with `null` values; only include stable, semantic fields (never timestamps).
- `created_at` and `details` are **not** part of identity.

#### Hashing algorithm / stored key
`deterministic_id = SHA-256( canonical_json(identity) )` where `canonical_json` is UTF-8 JSON with:
- keys sorted (`sort_keys=true`)
- compact separators (no whitespace)

`deterministic_id` is stored as a 64-char lowercase hex string and must be unique.

#### Event-type requirements (v1)
- `capture_verified`:
  - `source_kind = "capture"`
  - `source_id = capture_id`
  - `attributes` omitted (empty) for `v1_points`

### Moderation effects
- If a verified capture is later hidden, it no longer counts toward rank.
- Rank is recomputed from the current set of still-verified captures, so rank can go down.

## Gating policy (API enforced)

Discovery is always gated by `nodes.min_rank <= user.rank`.

The following write limits are rank-tiered:
- Check-in challenges per user per node per 5-minute window.
- Capture creation per user per node per rolling 24-hour window.

The global pending-verification cap per node is not rank-tiered.

### Tier table

| Tier | Rank range | Check-in challenges per node / 5 min | Captures per node / 24h | Notes |
| --- | --- | --- | --- | --- |
| New | 0 | 3 | 1 | Baseline access; unlocks rank with first verified capture. |
| Apprentice | 1-2 | 5 | 2 | Stable participation with low abuse risk. |
| Contributor | 3-5 | 8 | 4 | Higher throughput for proven users. |
| Trusted | 6+ | 12 | 6 | Broad access for consistent contributors. |

## /v1/me contract (rank explanation)

`GET /v1/me` returns:
- `rank`: current rank (int).
- `rank_version`: `v1_points`.
- `rank_breakdown`: counts used to compute rank (including caps applied).
- `next_unlock`: the next tier threshold and what it unlocks (or null if at top tier).

## Explanation guidelines ("why" language)
- State the current rank and the verified actions counted.
- Explain caps in plain terms ("only one verified capture per node per day counts").
- Point to the next unlock with a concrete requirement ("2 more verified captures").
- Avoid blame or judgement; keep tone factual and encouraging.

## Examples

1) Rank 0 -> 1
- User has no verified captures (rank 0).
- One capture at Node A is verified on 2026-02-01.
- Rank becomes 1.

2) Repeat captures at the same node
- Two captures at Node B are verified on 2026-02-02.
- Only one counts for rank (per-node/day cap).
- Rank increases by 1, not 2.

3) Moderated content reduces rank
- A verified capture at Node C on 2026-02-03 raises rank by 1.
- The capture is later hidden.
- Rank is recomputed and drops by 1 because the capture is no longer verified.
