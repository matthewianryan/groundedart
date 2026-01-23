from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path

from geoalchemy2.elements import WKTElement

from groundedart_api.db.models import Node
from groundedart_api.db.session import create_sessionmaker
from groundedart_api.settings import get_settings


async def main() -> None:
    settings = get_settings()
    sessionmaker = create_sessionmaker(settings.database_url)
    seed_path = Path(__file__).resolve().parents[3] / "data" / "seed" / "nodes.json"
    rows = json.loads(seed_path.read_text(encoding="utf-8"))

    async with sessionmaker() as db:
        for row in rows:
            node_id = uuid.UUID(row["id"])
            existing = await db.get(Node, node_id)
            location = WKTElement(f"POINT({float(row['lng'])} {float(row['lat'])})", srid=4326)
            if existing is None:
                db.add(
                    Node(
                        id=node_id,
                        name=row["name"],
                        description=row.get("description"),
                        category=row["category"],
                        location=location,
                        radius_m=int(row["radius_m"]),
                        min_rank=int(row["min_rank"]),
                        image_path=row.get("image_path"),
                        image_attribution=row.get("image_attribution"),
                        image_source_url=row.get("image_source_url"),
                        image_license=row.get("image_license"),
                    )
                )
            else:
                existing.name = row["name"]
                existing.description = row.get("description")
                existing.category = row["category"]
                existing.location = location
                existing.radius_m = int(row["radius_m"])
                existing.min_rank = int(row["min_rank"])
                existing.image_path = row.get("image_path")
                existing.image_attribution = row.get("image_attribution")
                existing.image_source_url = row.get("image_source_url")
                existing.image_license = row.get("image_license")

        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())
