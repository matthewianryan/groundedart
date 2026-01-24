from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from groundedart_api.settings import get_settings


def _get_repo_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / ".git").exists():
            return parent
    raise RuntimeError("Could not locate repo root for seed data.")


def _load_node_images(seed_path: Path) -> list[dict[str, object]]:
    return json.loads(seed_path.read_text(encoding="utf-8"))


def _iter_download_targets(rows: Iterable[dict[str, object]]) -> Iterable[tuple[str, str]]:
    seen_paths: set[str] = set()
    for row in rows:
        image_path = row.get("image_path")
        if not isinstance(image_path, str) or not image_path.strip():
            continue
        url = row.get("image_thumb_url") or row.get("image_original_url")
        if not isinstance(url, str) or not url.strip():
            continue
        if image_path in seen_paths:
            continue
        seen_paths.add(image_path)
        yield image_path, url


def _download_image(url: str, dest: Path, *, timeout: float) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp_path = dest.with_suffix(dest.suffix + ".partial")
    request = Request(url, headers={"User-Agent": "GroundedArt/0.1"})
    with urlopen(request, timeout=timeout) as response:
        with temp_path.open("wb") as handle:
            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break
                handle.write(chunk)
        temp_path.replace(dest)


def _ensure_node_images(media_root: Path, rows: list[dict[str, object]]) -> None:
    failures: list[str] = []
    for image_path, url in _iter_download_targets(rows):
        dest = media_root / image_path
        if dest.exists() and dest.stat().st_size > 0:
            continue
        retries = 3
        for attempt in range(1, retries + 1):
            try:
                _download_image(url, dest, timeout=20.0)
                break
            except (HTTPError, URLError, TimeoutError) as exc:
                if attempt == retries:
                    failures.append(f"{image_path} <- {url} ({exc})")
                else:
                    time.sleep(1.0 * attempt)
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{image_path} <- {url} ({exc})")
                break
    if failures:
        joined = "\n".join(failures[:15])
        raise RuntimeError(
            "Failed to download one or more node images:\n"
            f"{joined}\n"
            "Re-run scripts/seed_node_images.py to retry."
        )


def main() -> None:
    settings = get_settings()
    media_root = Path(settings.media_dir).resolve()
    seed_path = _get_repo_root() / "data" / "seed" / "node_images.json"
    rows = _load_node_images(seed_path)
    _ensure_node_images(media_root, rows)


if __name__ == "__main__":
    main()
