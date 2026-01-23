from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
import uuid
from pathlib import Path

from sqlalchemy import select

from groundedart_api.db.models import Device, User
from groundedart_api.db.session import create_sessionmaker
from groundedart_api.settings import get_settings


def _load_seed_values() -> tuple[uuid.UUID, str]:
    seed_path = Path(__file__).resolve().parents[3] / "data" / "seed" / "demo_account.json"
    seed_data: dict[str, str] = {}
    if seed_path.exists():
        seed_data = json.loads(seed_path.read_text(encoding="utf-8"))
    user_id_raw = os.getenv("DEMO_USER_ID") or seed_data.get("user_id")
    device_id = os.getenv("DEMO_DEVICE_ID") or seed_data.get("device_id")
    if not user_id_raw or not device_id:
        raise ValueError("Missing DEMO_USER_ID/DEMO_DEVICE_ID and no seed data found.")
    return uuid.UUID(user_id_raw), device_id


async def main() -> None:
    settings = get_settings()
    sessionmaker = create_sessionmaker(settings.database_url)
    user_id, device_id = _load_seed_values()
    now = dt.datetime.now(dt.UTC)

    async with sessionmaker() as db:
        user = await db.get(User, user_id)
        if user is None:
            user = User(id=user_id)
            db.add(user)
            await db.flush()

        device = await db.scalar(select(Device).where(Device.device_id == device_id))
        if device is None:
            db.add(Device(device_id=device_id, user_id=user_id, last_seen_at=now))
        else:
            device.user_id = user_id
            device.last_seen_at = now

        await db.commit()

    print(f"Seeded demo user {user_id} with device {device_id}.")


if __name__ == "__main__":
    asyncio.run(main())
