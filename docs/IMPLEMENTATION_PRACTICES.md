# Implementation practices

This document describes *how* we implement the system described in `docs/ARCHITECTURE.md`.

## Service boundaries

- `apps/api` is the *authority* for: geofence checks, check-in token issuance, gating decisions, and state transitions.
- `apps/web` is the *assistant* for: UX, location reads, capture UI, and resilient networking.
- `packages/domain` holds shared **schemas and reason codes** (language-agnostic); do not put framework code here.

## API conventions

- Version all endpoints under `/v1`.
- Prefer explicit state machines with reason codes over booleans.
- Return structured errors with stable machine-readable codes.
- Treat all client-provided evidence (location, timestamps, EXIF claims) as untrusted input.

## Anonymous sessions (device-based)

MVP goal: remove login friction while still having a stable server-side identity.

- The web client generates a stable `device_id` (UUID) and stores it locally.
- The API creates (or reuses) a `user` bound to that `device_id` and issues an HttpOnly session cookie.
- Later “real auth” (email/OAuth) upgrades the same user by attaching verified identifiers and issuing new sessions.

## Geo enforcement

- Store nodes in Postgres with PostGIS enabled.
- The server performs geofence decisions (e.g. `ST_DWithin`) and enforces accuracy thresholds.
- A short-lived challenge + one-time check-in token reduces replay and “upload later from anywhere”.

## Capture pipeline (MVP)

- Capture creation requires a valid, unexpired, unused check-in token.
- Uploads can use local disk storage in development; production should switch behind the same storage interface.
- Verification should be asynchronous and auditable; MVP can start with “geo passed” as the only hard gate.

## Testing philosophy

- Unit test state machines and policy functions (pure, deterministic).
- Keep API integration tests minimal and deterministic; avoid fragile geo dependence unless running against PostGIS.

