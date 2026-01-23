from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from groundedart_api.settings import Settings, get_settings
from groundedart_api.storage.local import LocalMediaStorage


def get_media_storage(settings: Settings = Depends(get_settings)) -> LocalMediaStorage:
    return LocalMediaStorage(settings)


MediaStorageDep = Annotated[LocalMediaStorage, Depends(get_media_storage)]
