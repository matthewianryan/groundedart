# Privacy & security posture

Grounded Art’s “proof-of-presence” design creates inherent sensitivity: location data and user-generated imagery can be abused if collected or exposed carelessly.

## Privacy defaults (recommended)
- **Do not track trails**: avoid storing continuous location histories.
- **Store only what you need**: keep the minimum fields required for verification and abuse prevention.
- **Separate evidence from identity**: do not require real-world identity for trust; use progressive reputation instead.
- **Be explicit about visibility**: distinguish private capture, limited share, and public post.

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
- What is the default visibility of a capture: private until verified, or public with “unverified”?
- Are nodes community-created at MVP, or admin-curated only?
- Do we ever store raw GPS accuracy/altitude, or only derived “inside/outside” evidence?

