# Roadmap

This file translates the product intent into buildable milestones. It is written to keep scope tight while preserving the “fundamental system” (proof-of-presence → trust → unlocks).

## Milestone 0 — Demoable discovery (MVP)
**Goal:** a user can open the app and discover starter nodes on a map.

Deliverables:
- Node dataset (seed) and a map UI that renders nodes in view.
- Node detail page with basic metadata and any existing verified captures.

Notes:
- Leaflet (React-Leaflet) is typically the fastest path for hackathon velocity.

## Milestone 1 — On-site check-in (MVP)
**Goal:** a user can only begin a capture flow when physically inside a node.

Deliverables:
- Geofence model for nodes (radius or polygon).
- Server-side “check-in token” flow with expiry and replay protection.
- Clear UX for “not inside the zone”, including accuracy handling.

## Milestone 2 — Capture + upload (MVP)
**Goal:** a user can capture and upload a photo reliably on mobile networks.

Deliverables:
- Camera capture flow and client-side compression.
- Resilient uploads (retry/resume where possible).
- Capture record creation that requires a valid check-in token.

## Milestone 3 — Verification state machine (MVP)
**Goal:** captures become trusted through explicit states; rank derives from trusted actions.

Deliverables:
- Capture states: draft → pending_verification → verified/rejected/hidden.
- Basic anti-abuse protections (rate limits, per-node submission caps).
- Optional similarity/duplicate detection as an async job.

## Milestone 4 — Rank + gating (MVP)
**Goal:** users unlock more nodes/features based on verified contributions.

Deliverables:
- Rank computation rules and an auditable event log.
- API-level gating for node visibility and posting privileges.
- UX that explains unlocks and requirements.

## Milestone 5 — Attribution + artist value loop (upgrade)
**Goal:** public posting requires attribution; tipping receipts can gate certain actions later.

Deliverables:
- Required attribution fields to publish.
- Optional tip receipt integration behind an adapter boundary.

## Milestone 6 — Observability (upgrade, do early if possible)
**Goal:** rapid debugging of demo failures and real-world issues.

Deliverables:
- Structured logs and request IDs in the API.
- Tracing/metrics for uploads and verification jobs.
