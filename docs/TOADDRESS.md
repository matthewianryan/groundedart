## Current gaps to address

This document originally tracked early milestone gaps. Many items below are now implemented; see “Resolved since this was written”.

Last updated: 2026-01-23

## Resolved since this was written (no longer gaps)
- Rank derivation + audit log: rank is now derived from deterministic `rank_events` and materialized into daily/cache tables; capture verification appends events and refreshes rank.
- Moderation/reporting: content reports exist and admin can resolve reports and hide/takedown captures; capture state transitions are audited via `capture_events`.
- Observability: `X-Request-ID` middleware, structured access logs, `GET /metrics`, and optional tracing are wired.
- Anti-abuse + rate limits: check-in challenge limits, capture rate limits, report rate limits, and abuse event recording exist.
- Artists/tips: `artists`, `nodes.default_artist_id`, tip intents, receipt verification, DB-backed tip totals, and a reconciler exist (web UI is feature-flagged).

## Still outstanding / not implemented
- Verification pipeline + async jobs: verification is admin-driven; there is no queue/worker boundary and no non-noop verification event emitter.
- Artwork/Artist entities beyond demo tips: there is no first-class `artworks` model, artist attribution linking, or reference image workflow (beyond the capture fields).
- Media storage at scale: uploads are dev-only local filesystem storage served at `/media/*`; there is no object storage, signed URLs, or production access control.
- Rights/consent beyond required fields: public visibility enforces required attribution + rights fields, but there is no richer consent model (e.g., explicit venue/artist consent flags, license metadata, or dispute workflows beyond reporting/hide).
- Auth/account recovery: still anonymous device sessions only; no login, migration, or recovery flows.

## “Nodes do not load” debugging notes
If nodes are missing in the UI, the most common causes are:
- Missing/invalid Google Maps key (`VITE_GOOGLE_MAPS_API_KEY`) causing the map to fail to initialize cleanly.
- API origin/cookie/CORS mismatch (web must send `credentials: include`, API must allow the web origin, and cookie must be sent).
- No seed data in the DB (`data/seed/nodes.json` not applied).
