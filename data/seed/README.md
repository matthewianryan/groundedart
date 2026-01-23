# `data/seed`

Seed datasets used for initial demos and local development.

Recommended contents:
- A documented schema for nodes (including geometry) and starter records
- A small “starter nodes” dataset that matches the MVP map experience
- A demo account seed for the puppet-driven hackathon flow
  - Used by `apps/api/scripts/seed_demo_account.py`.
- Optional node imagery (stored locally) with source attribution for demo UI

### Source and licensing assumptions
- Seed nodes are derived from publicly listed place records surfaced via Google Places (art galleries, museums, studios, and notable public art). Only factual fields (name, coordinates, high-level description) are kept; no copyrighted imagery or proprietary reviews are included.
- Usage must comply with the Google Maps Platform Terms of Service for Places data. Do not redistribute Places-derived content beyond this demo dataset and the map experiences powered by Google Maps.
- When adding new entries, prefer sources that clearly permit reuse of factual place data (e.g., official venue sites, open data portals) and note the source alongside the record if it is not Google Places.
- Avoid personal location history or sensitive/private studios without explicit permission.
- Node images should be backed by explicit licenses (CC BY/CC BY-SA/PD) with attribution stored in `data/seed/node_images.json`.

Guidelines:
- Avoid including personal location history or sensitive data.
- Prefer anonymized/public reference sources and explicit licenses for any images.

## Refreshing nodes from Google Places

Use `apps/api/scripts/generate_seed_nodes_from_places.py` to refresh the dataset.

Requirements:
- `VITE_GOOGLE_MAPS_API_KEY` must be set in the environment.
- The key must have the Places API enabled in Google Cloud Console.

Example:
```bash
set -a; source .env; set +a
./.venv311/bin/python apps/api/scripts/generate_seed_nodes_from_places.py
```

If you see `REQUEST_DENIED`, enable the Places API for the project that owns the key.
