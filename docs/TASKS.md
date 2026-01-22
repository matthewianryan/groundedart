# Tasks — Milestone 0 (Demoable discovery)

This file is the actionable checklist for the *current* milestone.

Source of truth for milestone scope: `docs/ROADMAP.md`.

## Goal
A user can open the app and discover starter nodes on a map, then open a node detail view.

## Definition of done (Milestone 0)
- Web app renders a map with nodes for the current viewport.
- Tapping a node opens a detail view with basic metadata.
- If the API has any `verified` captures for the node, they display; otherwise an empty state is shown.
- Local dev setup is documented and repeatable.

## Tasks

### Data (seed)
- [ ] Expand `data/seed/nodes.json` to a small, realistic starter set (10–30 nodes).
- [ ] Document the source/licensing assumptions for seed entries in `data/seed/README.md`.

### API (read paths for discovery)
- [ ] Ensure the API can be run locally against PostGIS via `infra/docker-compose.yml` (document commands and env in `apps/api/README.md`).
- [ ] Add `GET /v1/nodes/{node_id}` to support the node detail view (match the shape of `NodePublic` in `apps/api/src/groundedart_api/api/schemas.py`).
- [ ] Add `GET /v1/nodes/{node_id}/captures?state=verified` (or equivalent) returning a small, stable payload for the detail page.
- [ ] Add an API smoke test that seeds nodes and exercises `GET /v1/nodes` with a `bbox` filter.

### Web (map + node detail)
- [ ] Bootstrap `apps/web` (React + TypeScript) with a single `Map` route and a `NodeDetail` route.
- [ ] Render a map (Leaflet/React-Leaflet recommended) and query the API for nodes in the current viewport.
- [ ] Display nodes as markers and support selecting a node (tap/click) to open detail view.
- [ ] Detail view shows node metadata and a “Verified captures” section with an empty state.
- [ ] Provide a minimal “first run” doc in `apps/web/README.md` (dev server, API base URL, common pitfalls).

### UX polish (demo-critical)
- [ ] Handle loading/error states for node fetching (clear messages, retry).
- [ ] Basic mobile responsiveness (map fills viewport; detail panel works on small screens).

## Out of scope (Milestone 0)
- On-site check-in (geofence token issuance/verification).
- Capture + upload flows.
- Rank gating UX and progressive unlocks.
