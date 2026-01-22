# Repository structure

This repo is intentionally organized around *system boundaries*, not frameworks. The goal is to keep product concepts stable even as implementation choices evolve.

## Proposed layout
```
.
├── apps/
│   ├── web/            # Client (web/PWA): map, capture UI, uploads
│   └── api/            # Core API: geo enforcement, gating, auth, writes/reads
├── packages/
│   ├── domain/         # Domain model/types, policy enums, shared validation rules
│   ├── ui/             # Shared UI primitives (if needed)
│   └── shared/         # Utilities shared across apps (no domain logic)
├── data/
│   └── seed/           # Seed datasets + schemas for nodes/artworks
├── infra/              # Deployment/IaC, env templates, observability config
└── docs/               # Product + system docs (source of truth early on)
```

## Boundaries (what goes where)
- `apps/web`: UX, client-side location reads, upload UX, caching, rendering.
- `apps/api`: the authority for verification and gating; never trust the client.
- `packages/domain`: shared language (entities, states, reason codes); no framework code.
- `data/seed`: “starter nodes” and local development datasets (schema documented).
- `infra`: deployment wiring; should not contain product logic.

## Naming conventions (recommended)
- Use “capture” for user-submitted photos (not “post”) until verification is explicit.
- Prefer “node” for places and “artwork” for pieces; keep those distinct.
- Verification states should be finite and explainable (store reason codes).

