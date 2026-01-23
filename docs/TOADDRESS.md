## Current Gaps to address

- Verification pipeline + async jobs: no worker/queue boundary implemented yet; verification is not a first‑class record (ARCHITECTURE.md, ROADMAP.md).
- Artwork/Artist entities: conceptual model exists, but there’s no DB schema or API for artworks/artists or reference images (DATA_MODEL.md).
- Rank derivation + audit log: rank is stored, not computed from verified events; no event log (M0.md, ROADMAP.md).
- Moderation/rights/consent: capture visibility policy, consent flags, and moderation flow are not implemented (PRIVACY_SECURITY.md, ROADMAP.md).
- Media storage at scale: still API‑terminated local storage; no object storage or signed URLs (M0.md, FUTUREOPTIONS.md).
- Anti‑abuse + rate limits: called out in architecture/roadmap but not present (ARCHITECTURE.md, ROADMAP.md).
- Observability: structured logs/metrics/tracing aren’t wired (ROADMAP.md).

### Some gaps are explicitly scheduled in current M2 tasks; others are deferred to later milestones.

In M2 tasks:

Upload robustness, limits, idempotency, and error codes are scoped in TASKS.md (M2‑05) with tests called out (M2‑05, M2‑06).
Web capture UX, preprocessing, and retry/persisted intent are scoped in TASKS.md (M2‑02, M2‑03, M2‑04).
End‑to‑end reliability checklist + smoke coverage is scoped in TASKS.md (M2‑06).

Deferred to roadmap milestones:

Verification pipeline + async scoring/moderation boundary is Milestone 3 in ROADMAP.md.
Rank derivation + gating as a computed system is Milestone 4 in ROADMAP.md.
Rights/consent + attribution enforcement is Milestone 5 in ROADMAP.md.
Observability (logs/metrics/tracing) is Milestone 6 in ROADMAP.md.
Object storage + signed URLs are explicitly deferred (see FUTUREOPTIONS.md).


## Nodes do not load

Consistent bug or error where nodes are not present.