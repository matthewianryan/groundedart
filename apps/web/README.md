# `apps/web`

Client app (Vite + React).

## First run

Prereqs:
- Node.js 18+
- Google Maps Platform API key with Maps JavaScript API, Directions API, Places API, and Geocoding API enabled (restrict it to HTTP referrers for `localhost:5173`).

From `apps/web`:
- `npm install`
- `cp .env.example .env` (optional)
- Add `VITE_GOOGLE_MAPS_API_KEY` to `.env` (required for the map, directions, and Places/Geocoding features).
- `npm run dev`

Dev server:
- Vite runs at `http://localhost:5173` by default.

API base URL:
- The web app expects the API at `VITE_API_ORIGIN` (default `http://localhost:8000`).
- Set it in `apps/web/.env`, then restart `npm run dev` after changes.

Common pitfalls:
- API not running or on a different port (update `VITE_API_ORIGIN` if you changed it).
- Missing or invalid Google Maps API key (map will not load without `VITE_GOOGLE_MAPS_API_KEY`), or required APIs (Maps JS, Directions, Places/Geocoding) not enabled on the key.
- Stale `.env` values (Vite only picks them up on restart).
- No nodes showing because the API database is empty (seed nodes or run the API seed script).
