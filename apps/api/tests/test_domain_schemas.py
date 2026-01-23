from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

import jsonschema
import pytest


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _schema_dir() -> Path:
    return _repo_root() / "packages" / "domain" / "schemas"


def _iter_schema_files(schema_dir: Path) -> Iterable[Path]:
    return sorted(schema_dir.glob("*.json"))


def _iter_refs(value: Any) -> Iterable[str]:
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "$ref" and isinstance(item, str):
                yield item
            else:
                yield from _iter_refs(item)
    elif isinstance(value, list):
        for item in value:
            yield from _iter_refs(item)


def _load_schema(schema_path: Path) -> dict[str, Any]:
    try:
        return json.loads(schema_path.read_text())
    except json.JSONDecodeError as exc:
        raise AssertionError(f"Invalid JSON in schema: {schema_path}") from exc


@pytest.mark.parametrize("schema_path", _iter_schema_files(_schema_dir()))
def test_domain_schema_valid(schema_path: Path) -> None:
    schema = _load_schema(schema_path)
    validator_cls = jsonschema.validators.validator_for(schema)

    try:
        validator_cls.check_schema(schema)
    except jsonschema.exceptions.SchemaError as exc:
        raise AssertionError(f"Invalid JSON Schema: {schema_path}") from exc

    resolver = jsonschema.RefResolver(base_uri=schema_path.resolve().as_uri(), referrer=schema)
    for ref in _iter_refs(schema):
        try:
            resolver.resolve(ref)
        except Exception as exc:
            raise AssertionError(
                f"$ref resolution failed in {schema_path}: {ref}"
            ) from exc
