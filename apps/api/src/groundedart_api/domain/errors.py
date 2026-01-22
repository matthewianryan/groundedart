from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AppError(Exception):
    code: str
    message: str
    status_code: int = 400
    details: dict[str, Any] | None = None

