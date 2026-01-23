# Privacy & security posture

Grounded Art’s “proof-of-presence” design creates inherent sensitivity: location data and user-generated imagery can be abused if collected or exposed carelessly.

## Privacy defaults (recommended)
- **Do not track trails**: avoid storing continuous location histories.
- **Store only what you need**: keep the minimum fields required for verification and abuse prevention.
- **Separate evidence from identity**: do not require real-world identity for trust; use progressive reputation instead.
- **Be explicit about visibility**: distinguish private capture, limited share, and public post (policy in `docs/ATTRIBUTION_RIGHTS.md`).
- **Strip image metadata**: client-side preprocessing re-encodes uploads to remove EXIF (including GPS) by default.

## Image uploads (client posture)
- Client preprocessing resizes the longest edge to 1600px, encodes as JPEG, and targets 1.5MB max per capture.
- EXIF metadata is removed by re-encoding; GPS data should never reach the server from default uploads.

## Security goals (MVP)
- The server must be the authority for geofence verification and gating.
- Captures must be bound to a short time window after check-in.
- Abuse must be rate-limited and auditable.
- Media storage must be access-controlled (signed URLs, scoped tokens).

## Primary threat cases and mitigations
- **GPS spoofing**: server-side geometry checks + short-lived check-in tokens + rate limits.
- **Replay attacks**: one-time nonces and expiring tokens; bind to `(user, node)`.
- **Old-photo uploads**: time window constraints; similarity checks vs known references; moderation.
- **Rank farming**: score only verified captures; penalize suspicious behavior; per-node caps.
- **Harassment/copyright**: report + takedown path; keep moderation state machine from day one.

## Open questions to decide explicitly
- Default visibility is `private`; verified captures require explicit publish (see `docs/ATTRIBUTION_RIGHTS.md`).
- Are nodes community-created at MVP, or admin-curated only?
- Do we ever store raw GPS accuracy/altitude, or only derived “inside/outside” evidence?
