# Product intent

## Problem the product solves
Most “maps of art” fail because the content is either stale, low-quality, or untrustworthy. Grounded Art’s intent is to produce a living map of local art that stays current because:
- people can only contribute by physically visiting,
- contributions are attributable, verifiable, and ranked,
- discovery improves as trust grows.

## North-star experience
Open the app anywhere in a city and quickly answer:
- “Where is nearby art worth seeing right now?”
- “Who made it, and how can I support them?”

## Core mechanic: proof-of-presence → trust → unlocks
The key design is an incentive loop:
1. The app starts “sparse” (a few starter nodes).
2. Visiting and contributing verified captures increases curator rank.
3. Higher rank unlocks richer discovery and contribution features (more nodes, better filters, posting privileges).

This turns *real-world effort* into *digital access*, which encourages truthful participation without requiring formal identity.

## Why it must be map-first
Map-first keeps the experience grounded in place:
- it reduces “feed spam” incentives early,
- it makes verification legible (“you’re here, so you can do this”),
- it aligns with discovery as the primary user value.

## Local constraints (especially Africa)
The product should assume:
- intermittent connectivity and high data cost,
- mid/low-end devices,
- variable GPS accuracy,
- mixed literacy and language contexts.

## Practical implications:
- compress and upload efficiently; design for retries,
- keep map + node payloads small and cacheable,
- explain verification states in simple language,
- avoid features that require long synchronous waits.

## Content rights and consent (non-negotiables)
To avoid becoming a “scrape-and-repost” machine:
- attribution is part of the capture model, not a comment field,
- default visibility should be conservative until verified,
- support takedown/reporting and creator claims as first-class flows.

## Visual Design Practices
- Color Pallette: Cream, Dark Charcoal text and Pomegranate Red highlights
- Minimalistic UI. Only features absolutely essential to the app should be visible.