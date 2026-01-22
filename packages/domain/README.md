# `packages/domain`

Domain model and shared vocabulary.

This package should contain:
- Entity/type definitions (Node, Artwork, Capture, Verification)
- State machines and reason codes (e.g., `pending_verification`, `verified`, `rejected`)
- Policy and validation rules that must be consistent across client and server

Current approach (cross-language):
- Canonical JSON schemas live in `packages/domain/schemas/` and can be used for codegen later.

This package should not contain:
- Framework/runtime-specific code (React/FastAPI/DB clients)
- Network calls or side effects

