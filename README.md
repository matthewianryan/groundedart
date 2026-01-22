# Grounded Art

Grounded Art is a location-based art discovery app built around *proof-of-presence*: you unlock and contribute content by physically visiting real-world art (galleries, murals, sculptures) and submitting verified captures.

The long-term intent is a trustable public map of local art that:
- Makes discovery effortless (map-first, feed later).
- Rewards “doing the work” (visiting, attributing, verifying) with progressive unlocks.
- Routes value back to artists (tips/receipts later) without forcing heavy identity.

## Core loop (MVP)
1. View a sparse set of starter nodes on a map.
2. Arrive on-site → pass a geofence check-in.
3. Capture and upload a photo with attribution.
4. Automatic + human-in-the-loop verification improves trust.
5. Verified contributions increase curator rank and unlock more nodes/features.

## Documentation
- Start here: `docs/README.md`
- Product intent: `docs/PRODUCT.md`
- System architecture: `docs/ARCHITECTURE.md`
- Domain/data model: `docs/DATA_MODEL.md`
- Privacy + security posture: `docs/PRIVACY_SECURITY.md`
- Repo layout + boundaries: `docs/REPO_STRUCTURE.md`
- Roadmap: `docs/ROADMAP.md`
- Current milestone tasks: `docs/TASKS.md`

## Repo status
This repository contains initial scaffolding for:
- `apps/api` (FastAPI + Postgres/PostGIS): anonymous device sessions, node discovery, check-in tokens, capture creation, and dev-only local media uploads.
- `apps/web` (Vite + React): map-first browsing + check-in/capture flow wired to the API.

## Google Maps Platform (required)
- Enable Maps JavaScript API, Directions API, Places API, and Geocoding API on a Google Cloud project.
- Create an API key restricted to HTTP referrers for local dev (`http://localhost:5173/*`) and add it to `apps/web/.env` as `VITE_GOOGLE_MAPS_API_KEY`.

Quick start:
- `docker compose -f infra/docker-compose.yml up -d db`
- `source .venv311/bin/activate && pip install -e "apps/api[dev]" && (cd apps/api && alembic upgrade head) && python apps/api/scripts/seed_nodes.py`
- `uvicorn groundedart_api.main:app --reload --port 8000`
- `cd apps/web && npm install && cp .env.example .env && npm run dev` (set `VITE_GOOGLE_MAPS_API_KEY` for the map/Directions/Places/Geocoding APIs)
