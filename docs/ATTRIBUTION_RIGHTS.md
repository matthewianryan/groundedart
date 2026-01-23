# Attribution + rights policy

This document is the single source of truth for when captures are visible to others and which attribution/consent fields are required.

## Definitions
- **Private**: only the owner (and admins) can view the capture image and metadata.
- **Public**: visible to non-owners in node listings/detail responses.
- **Verified**: capture state is `verified` in the server state machine.

## Visibility rules (if/then)
- If `capture.state != verified`, then the capture is **not public**, regardless of visibility.
- If `capture.visibility != public`, then the capture is **not public**, even if verified.
- If any required attribution fields are missing or empty, then the capture is **not public**.
- If rights requirements are missing or unattested, then the capture is **not public**.
- Only when the capture is `verified`, `visibility == public`, and all required attribution + rights fields are present, then the capture **is public**.

## Default behavior
- New captures are created with `visibility = private`.
- Verification does **not** auto-promote visibility.
- Owners must explicitly publish (set `visibility = public`) after meeting requirements.

## Required fields for public visibility
Attribution (all required, non-empty):
- `attribution_artist_name`
- `attribution_artwork_title`
- `attribution_source` (freeform; where the attribution came from, e.g., "on-site signage", "artist website", "gallery placard")

Rights (all required):
- `rights_basis` enum:
  - `i_took_photo`
  - `permission_granted`
  - `public_domain`
- `rights_attestation` (boolean in API; must be `true`)
- `rights_attested_at` (server timestamp set when `rights_attestation` is accepted)

Optional but recommended:
- `attribution_source_url` (URL when the source is online)

## Shared contract + DB field list
These fields are the exact additions/requirements for shared schemas and persistence:
- `visibility` enum: `private | public`
- `attribution_source` (string, required for public)
- `attribution_source_url` (string URL, optional)
- `rights_basis` enum: `i_took_photo | permission_granted | public_domain`
- `rights_attestation` (API-only boolean write field)
- `rights_attested_at` (timestamp persisted in DB)

## Examples
1) **Private draft**
   - `state = draft`, `visibility = private`
   - Missing attribution and rights fields
   - Result: **not public**

2) **Verified but not public**
   - `state = verified`, `visibility = private`
   - Attribution + rights present
   - Result: **not public**

3) **Public verified**
   - `state = verified`, `visibility = public`
   - `attribution_artist_name`, `attribution_artwork_title`, `attribution_source` present
   - `rights_basis` set, `rights_attestation = true`, `rights_attested_at` set
   - Result: **public**
