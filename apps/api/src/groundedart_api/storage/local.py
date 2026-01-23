from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import uuid

from fastapi import UploadFile

from groundedart_api.domain.errors import AppError
from groundedart_api.settings import Settings


@dataclass(frozen=True)
class StoredMedia:
    path: str
    mime: str | None


class LocalMediaStorage:
    def __init__(self, settings: Settings) -> None:
        self._root = Path(settings.media_dir).resolve()
        self._root.mkdir(parents=True, exist_ok=True)
        self._allowed_mime_types = {mime.lower() for mime in settings.upload_allowed_mime_types}
        self._max_upload_bytes = settings.upload_max_bytes
        self._chunk_size = 1024 * 1024

    async def save_capture_image(self, capture_id: uuid.UUID, upload: UploadFile) -> StoredMedia:
        content_type = _normalize_content_type(upload.content_type)
        if not content_type or content_type not in self._allowed_mime_types:
            raise AppError(
                code="invalid_media_type",
                message="Unsupported upload content type.",
                status_code=415,
                details={"allowed": sorted(self._allowed_mime_types)},
            )

        ext = _safe_extension(content_type)
        filename = f"capture_{capture_id}{ext}"
        out_path = self._root / filename
        temp_name = f".{filename}.uploading-{uuid.uuid4().hex}"
        temp_path = self._root / temp_name

        bytes_written = 0
        success = False
        try:
            with temp_path.open("wb") as f:
                while True:
                    chunk = await upload.read(self._chunk_size)
                    if not chunk:
                        break
                    bytes_written += len(chunk)
                    if bytes_written > self._max_upload_bytes:
                        raise AppError(
                            code="file_too_large",
                            message="Uploaded file exceeds size limit.",
                            status_code=413,
                            details={"max_bytes": self._max_upload_bytes},
                        )
                    f.write(chunk)
                f.flush()
                os.fsync(f.fileno())
            temp_path.replace(out_path)
            success = True
        except AppError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise AppError(
                code="upload_incomplete",
                message="Upload interrupted before completion.",
                status_code=400,
            ) from exc
        finally:
            if not success and temp_path.exists():
                temp_path.unlink(missing_ok=True)

        # Return a relative path suitable for URL building.
        return StoredMedia(path=filename, mime=content_type)


def _safe_extension(content_type: str | None) -> str:
    if content_type == "image/jpeg":
        return ".jpg"
    if content_type == "image/png":
        return ".png"
    if content_type == "image/webp":
        return ".webp"
    return ""


def _normalize_content_type(content_type: str | None) -> str | None:
    if not content_type:
        return None
    return content_type.split(";", 1)[0].strip().lower()
