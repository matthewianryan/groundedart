# `apps/api`

Core API service.

Responsibilities:
- Authoritative geofence verification and short-lived check-in tokens
- Capture record creation and verification state transitions
- Rank computation (or rank event ingestion) and feature gating
- Signed media access (scoped URLs) and abuse protections (rate limits/audit)

Notes:
- Media scoring/similarity is often best as async jobs; it can live here initially but should be separable as a worker.

