# `apps/web`

Client app (web/PWA).

Responsibilities:
- Map-first discovery UX and node detail views
- Device location reads (with permission handling) and check-in UX
- Camera capture flow and resilient uploads (retries/resume, compression)
- Display of verification state, rank gating, and attribution requirements

Non-responsibilities:
- Authoritative geofence decisions (must live in `apps/api`)
- Permanent storage credentials or privileged media access

