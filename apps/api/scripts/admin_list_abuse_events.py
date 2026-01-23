from __future__ import annotations

import argparse
import json
import os
import sys

import httpx


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="List abuse events for admin review.")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("GROUNDEDART_API_BASE_URL", "http://localhost:8000"),
    )
    parser.add_argument("--admin-token", default=os.environ.get("ADMIN_API_TOKEN"))
    parser.add_argument("--user-id")
    parser.add_argument("--node-id")
    parser.add_argument("--event-type")
    parser.add_argument("--created-after")
    parser.add_argument("--created-before")
    parser.add_argument("--limit", type=int, default=100)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.admin_token:
        print("Missing admin token. Set ADMIN_API_TOKEN or pass --admin-token.", file=sys.stderr)
        sys.exit(2)

    params: dict[str, str | int] = {"limit": args.limit}
    if args.user_id:
        params["user_id"] = args.user_id
    if args.node_id:
        params["node_id"] = args.node_id
    if args.event_type:
        params["event_type"] = args.event_type
    if args.created_after:
        params["created_after"] = args.created_after
    if args.created_before:
        params["created_before"] = args.created_before

    with httpx.Client(base_url=args.base_url, headers={"X-Admin-Token": args.admin_token}) as client:
        response = client.get("/v1/admin/abuse-events", params=params)
        response.raise_for_status()
        print(json.dumps(response.json(), indent=2))


if __name__ == "__main__":
    main()
