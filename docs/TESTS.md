# Testing Guide

This document captures the current testing state and best practices for Grounded Art.

## Current coverage (repo reality)

- API tests exist under `apps/api/tests/` using pytest + httpx + a real PostGIS database.
- Tests cover: check-in challenge validation, geofence failures/success, capture token validation, and basic node/capture listing.
- There is no frontend test harness wired in `apps/web` yet (no test scripts in `apps/web/package.json`).

## Running tests

From repo root:

```bash
source .venv311/bin/activate
cd apps/api
pytest
```

## Architecture notes for testability

No immediate architectural changes are required for API testing: the FastAPI app, DB session factory, and ASGI client are already testable.

Where testability will improve with light structure:

- Storage: keep file storage behind an interface so tests can point to a temp dir or stub storage without touching production paths.
- Time: time-based logic (token expiry, session TTLs) is easier to test if we can inject `utcnow()` or freeze time.
- Web: the UI needs a test runner (Vitest/RTL or Playwright) to enable unit and E2E testing; this is setup work, not architecture.

## What needs tests (by functionality)

API (FastAPI + PostGIS):
- Sessions: device reuse, session cookie issuance, expiration behavior, and error handling.
- Auth gates: `CurrentUser` vs `OptionalUser` behaviors for endpoints like `/v1/nodes` and `/v1/me`.
- Nodes: invalid bbox parsing, node-not-found paths, rank filtering (min_rank) for both list and detail.
- Check-ins: challenge creation TTL, single-use semantics, accuracy threshold, and geofence distance details.
- Captures: token single-use, expired token, capture state creation, and state transitions.
- Uploads: `/v1/captures/{id}/image` happy path, forbidden upload, not found, and persistence of `image_path`/`image_mime`.
- Error contracts: stable `error.code` values matching `packages/domain/schemas/*_error_code.json`.

Domain/shared:
- Capture state transitions (already has unit tests) plus any future state machine or policy helpers.
- JSON schemas in `packages/domain/schemas/` should be validated if/when codegen or schema enforcement is introduced.

Web (React/Vite):
- API client wrappers: retry behavior, error messaging, and state updates.
- Check-in and capture UX: token display, capture creation, upload progress/errors.
- Location handling: accuracy threshold UX and outside-geofence UX.
- Guardrails: ensure the UI handles 401/403/400 responses consistently.

## Best practices

- Prefer small, deterministic API integration tests with real DB state reset (see `apps/api/tests/conftest.py`).
- Assert error codes + key fields rather than entire payloads to avoid brittle tests.
- In geofence tests, choose coordinates that are clearly inside/outside the radius to avoid boundary flakiness.
- Use helpers/fixtures to reduce setup noise (node creation, session creation, token insertion).
- For uploads, use a tiny fixture file and always clean up temp media paths if writing to disk.
- Keep test names behavior-focused (e.g., `test_checkin_outside_geofence_returns_403`).
