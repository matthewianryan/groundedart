Rank Gating

- Node discovery hides nodes above the user’s rank (list_nodes filters by min_rank, get_node returns a locked view). nodes.py
- Access to check-in and capture creation is blocked below a node’s required rank (rank_locked). gating.py nodes.py captures.py
- Rank tiers enforce rate limits (check-in challenges per 5 min, captures per node per 24h). gating.py settings.py
- Rank progression is capped (only one verified capture per node per day counts; daily points cap is 3). rank_materialization.py rank_constants.py copy.ts