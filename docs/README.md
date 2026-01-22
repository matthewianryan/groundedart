# Docs index

## What Grounded Art is
Grounded Art is a location-based art discovery app built around *proof-of-presence*.

Users start with a sparse map of starter nodes. By physically visiting real-world art and submitting verified captures (with attribution), they gain curator rank and unlock richer discovery and contribution features. Over time the product can route value back to artists (tips/receipts) while preserving low-friction onboarding and privacy.

## Read next (recommended order)
1. `docs/PRODUCT.md` — north star, core mechanic, constraints
2. `docs/ARCHITECTURE.md` — system intent, trust model, core flows
3. `docs/DATA_MODEL.md` — shared vocabulary and entity relationships
4. `docs/PRIVACY_SECURITY.md` — constraints and anti-abuse posture
5. `docs/ROADMAP.md` — MVP breakdown and milestones
6. `docs/TASKS.md` — active milestone task checklist
7. `docs/REPO_STRUCTURE.md` — directory layout and boundaries

## Success rubrics
### Product
- Map-first UX that needs no explanation (fast, accessible, low-data).
- Clear “why can/can’t I post?” states (verification + gating feel fair).

### Technical
- Geo + verification enforced server-side, not only client-side.
- Media pipeline is resilient on mobile networks (retries/resume, compression).
- Observability makes demo failures diagnosable.

### Business
- Works in local African constraints (cost, connectivity, literacy).
- Artist value loop is credible (attribution defaults, consent, low-friction tipping).
