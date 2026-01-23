from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path

from groundedart_api.db.models import Artist, Node, utcnow
from groundedart_api.db.session import create_sessionmaker
from groundedart_api.settings import get_settings

_BASE58_ALPHABET = set("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")


def _is_valid_solana_pubkey(value: str) -> bool:
    if not isinstance(value, str):
        return False
    length = len(value)
    if length < 32 or length > 44:
        return False
    return all(char in _BASE58_ALPHABET for char in value)


async def main() -> None:
    settings = get_settings()
    sessionmaker = create_sessionmaker(settings.database_url)
    seed_path = Path(__file__).resolve().parents[3] / "data" / "seed" / "artists.json"
    rows = json.loads(seed_path.read_text(encoding="utf-8"))

    async with sessionmaker() as db:
        for row in rows:
            artist_id = uuid.UUID(row["id"])
            pubkey = row["solana_recipient_pubkey"]
            if not _is_valid_solana_pubkey(pubkey):
                raise ValueError(f"Invalid Solana pubkey in seed data: {pubkey}")

            existing = await db.get(Artist, artist_id)
            now = utcnow()
            if existing is None:
                db.add(
                    Artist(
                        id=artist_id,
                        display_name=row["display_name"],
                        solana_recipient_pubkey=pubkey,
                        created_at=now,
                        updated_at=now,
                    )
                )
            else:
                existing.display_name = row["display_name"]
                existing.solana_recipient_pubkey = pubkey
                existing.updated_at = now

            for node_id in row.get("node_ids", []):
                node_uuid = uuid.UUID(node_id)
                node = await db.get(Node, node_uuid)
                if node is None:
                    raise ValueError(f"Unknown node id in seed data: {node_id}")
                node.default_artist_id = artist_id

        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())
