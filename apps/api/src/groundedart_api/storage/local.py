from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

from groundedart_api.settings import Settings


@dataclass(frozen=True)
class StoredMedia:
    path: str
    mime: str | None


class LocalMediaStorage:
    def __init__(self, settings: Settings) -> None:
        self._root = Path(settings.media_dir).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    async def save_capture_image(self, capture_id, upload: UploadFile) -> StoredMedia:
        ext = _safe_extension(upload.content_type)
        filename = f"capture_{capture_id}{ext}"
        out_path = self._root / filename

        with out_path.open("wb") as f:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)

        # Return a relative path suitable for URL building.
        return StoredMedia(path=filename, mime=upload.content_type)


def _safe_extension(content_type: str | None) -> str:
    if content_type == "image/jpeg":
        return ".jpg"
    if content_type == "image/png":
        return ".png"
    if content_type == "image/webp":
        return ".webp"
    return ""

