# Agent Instructions (groundedart)

## Git safety (non-negotiable)
- NEVER run `git checkout -- .` (ever).
- NEVER run any command that discards work without asking first, including:
  - `git restore .`, `git reset --hard`, `git clean -fd` / `git clean -fdx`, `git checkout -f`
- If you think a reset/revert is needed, STOP and ask me. Offer 2–3 safe options (e.g. `git stash -u`, commit to a WIP branch, or selectively revert specific files).
