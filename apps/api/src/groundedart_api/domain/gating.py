from __future__ import annotations

from dataclasses import dataclass

from groundedart_api.domain.errors import AppError


@dataclass(frozen=True)
class RankTier:
    name: str
    min_rank: int
    checkin_challenges_per_node_per_5_min: int
    captures_per_node_per_24h: int


RANK_TIERS: list[RankTier] = [
    RankTier(
        name="New",
        min_rank=0,
        checkin_challenges_per_node_per_5_min=3,
        captures_per_node_per_24h=1,
    ),
    RankTier(
        name="Apprentice",
        min_rank=1,
        checkin_challenges_per_node_per_5_min=5,
        captures_per_node_per_24h=2,
    ),
    RankTier(
        name="Contributor",
        min_rank=3,
        checkin_challenges_per_node_per_5_min=8,
        captures_per_node_per_24h=4,
    ),
    RankTier(
        name="Trusted",
        min_rank=6,
        checkin_challenges_per_node_per_5_min=12,
        captures_per_node_per_24h=6,
    ),
]


def get_rank_tier(rank: int) -> RankTier:
    tier = RANK_TIERS[0]
    for candidate in RANK_TIERS:
        if rank >= candidate.min_rank:
            tier = candidate
    return tier


def _insufficient_rank_details(
    *,
    rank: int,
    tier: RankTier,
    node_min_rank: int,
    feature: str,
) -> dict[str, int | str]:
    return {
        "current_rank": rank,
        "required_rank": node_min_rank,
        "node_min_rank": node_min_rank,
        "tier": tier.name,
        "tier_min_rank": tier.min_rank,
        "feature": feature,
    }


def _rate_limit_details(
    *,
    rank: int,
    tier: RankTier,
    max_per_window: int,
    window_seconds: int,
    recent_count: int,
) -> dict[str, int | str]:
    return {
        "current_rank": rank,
        "tier": tier.name,
        "tier_min_rank": tier.min_rank,
        "max_per_window": max_per_window,
        "window_seconds": window_seconds,
        "recent_count": recent_count,
    }


def assert_can_view_node(*, rank: int, node_min_rank: int) -> None:
    if rank < node_min_rank:
        raise AppError(code="node_not_found", message="Node not found", status_code=404)


def _assert_rank_for_node(*, rank: int, node_min_rank: int, feature: str) -> RankTier:
    tier = get_rank_tier(rank)
    if rank < node_min_rank:
        raise AppError(
            code="insufficient_rank",
            message="Insufficient rank",
            status_code=403,
            details=_insufficient_rank_details(
                rank=rank,
                tier=tier,
                node_min_rank=node_min_rank,
                feature=feature,
            ),
        )
    return tier


def assert_can_access_node(*, rank: int, node_min_rank: int, feature: str) -> RankTier:
    return _assert_rank_for_node(rank=rank, node_min_rank=node_min_rank, feature=feature)


def assert_can_checkin_challenge(
    *,
    rank: int,
    node_min_rank: int,
    recent_challenges: int,
    window_seconds: int,
) -> None:
    tier = _assert_rank_for_node(rank=rank, node_min_rank=node_min_rank, feature="checkin_challenge")
    max_per_window = tier.checkin_challenges_per_node_per_5_min
    if recent_challenges >= max_per_window:
        raise AppError(
            code="checkin_challenge_rate_limited",
            message="Check-in challenge rate limit exceeded",
            status_code=429,
            details=_rate_limit_details(
                rank=rank,
                tier=tier,
                max_per_window=max_per_window,
                window_seconds=window_seconds,
                recent_count=recent_challenges,
            ),
        )


def assert_can_checkin(
    *,
    rank: int,
    node_min_rank: int,
    recent_captures: int,
    window_seconds: int,
) -> None:
    tier = _assert_rank_for_node(rank=rank, node_min_rank=node_min_rank, feature="checkin")
    max_per_window = tier.captures_per_node_per_24h
    if recent_captures >= max_per_window:
        raise AppError(
            code="capture_rate_limited",
            message="Capture rate limit exceeded",
            status_code=429,
            details=_rate_limit_details(
                rank=rank,
                tier=tier,
                max_per_window=max_per_window,
                window_seconds=window_seconds,
                recent_count=recent_captures,
            ),
        )


def assert_can_create_capture(
    *,
    rank: int,
    node_min_rank: int,
    recent_captures: int,
    window_seconds: int,
) -> None:
    tier = _assert_rank_for_node(rank=rank, node_min_rank=node_min_rank, feature="capture_create")
    max_per_window = tier.captures_per_node_per_24h
    if recent_captures >= max_per_window:
        raise AppError(
            code="capture_rate_limited",
            message="Capture rate limit exceeded",
            status_code=429,
            details=_rate_limit_details(
                rank=rank,
                tier=tier,
                max_per_window=max_per_window,
                window_seconds=window_seconds,
                recent_count=recent_captures,
            ),
        )
