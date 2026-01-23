from __future__ import annotations

import datetime as dt
from typing import Callable


UtcNow = Callable[[], dt.datetime]


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


def get_utcnow() -> UtcNow:
    return utcnow
