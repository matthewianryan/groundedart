from __future__ import annotations

import argparse
import asyncio
import datetime as dt

from groundedart_api.db.models import utcnow
from groundedart_api.db.session import create_sessionmaker
from groundedart_api.domain.tip_receipts_reconciliation import reconcile_tip_receipts
from groundedart_api.settings import get_settings


async def _run_once() -> int:
    settings = get_settings()
    sessionmaker = create_sessionmaker(settings.database_url)
    interval = dt.timedelta(seconds=settings.tip_receipt_reconciliation_interval_seconds)
    cutoff = dt.timedelta(seconds=settings.tip_receipt_reconciliation_cutoff_seconds)
    now = utcnow()

    async with sessionmaker() as db:
        return await reconcile_tip_receipts(
            db,
            rpc_url=str(settings.solana_rpc_url),
            now=now,
            reconciliation_interval=interval,
            missing_cutoff=cutoff,
        )


async def _run_loop() -> None:
    settings = get_settings()
    interval_seconds = settings.tip_receipt_reconciliation_interval_seconds
    if interval_seconds < 1:
        raise ValueError("Reconciliation interval must be at least 1 second for loop mode.")

    while True:
        processed = await _run_once()
        print(f"reconcile_tip_receipts: processed={processed}")
        await asyncio.sleep(interval_seconds)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Reconcile tip receipt finality states.")
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Run continuously, sleeping for the configured interval between runs.",
    )
    args = parser.parse_args()

    if args.loop:
        await _run_loop()
    else:
        processed = await _run_once()
        print(f"reconcile_tip_receipts: processed={processed}")


if __name__ == "__main__":
    asyncio.run(main())
