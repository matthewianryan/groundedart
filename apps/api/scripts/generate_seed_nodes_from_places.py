from __future__ import annotations

import argparse
import json
import math
import os
import time
import unicodedata
import uuid
from pathlib import Path
from typing import Iterable

import httpx

DEFAULT_RADIUS_M = 5000
PLACES_TEXTSEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_KEY_ENV = "VITE_GOOGLE_MAPS_API_KEY"
UUID_NAMESPACE = uuid.UUID("1f9e1b2b-3ed4-4c0b-8d21-9d6c0d2c8c1e")

WATERFRONT_CENTER = (-33.9075, 18.4231)
RANK0_NAMES = {
    "Zeitz Museum of Contemporary Art Africa",
    "V&A Waterfront Public Art Route",
    "Battery Park Skate & Art Walls",
    "Watershed Art Market",
}

CAPETOWN_CENTERS = [
    ("Waterfront", -33.9075, 18.4231),
    ("CBD", -33.9249, 18.4241),
    ("Woodstock", -33.9297, 18.4479),
    ("Gardens", -33.9371, 18.4149),
    ("Sea Point", -33.9193, 18.3862),
    ("Green Point", -33.9106, 18.4099),
    ("Camps Bay", -33.9526, 18.3774),
    ("Observatory", -33.9351, 18.4686),
    ("Rondebosch", -33.9608, 18.4726),
    ("Newlands", -33.9768, 18.4591),
    ("Claremont", -33.9811, 18.4654),
    ("Constantia", -34.0262, 18.4183),
    ("Muizenberg", -34.1044, 18.4696),
]

SEARCH_QUERIES = [
    "art gallery Cape Town",
    "art studio Cape Town",
    "artist studio Cape Town",
    "art centre Cape Town",
    "art museum Cape Town",
    "museum Cape Town",
    "public art Cape Town",
    "sculpture Cape Town",
    "monument Cape Town",
    "mural Cape Town",
    "art supplies Cape Town",
    "art store Cape Town",
    "craft store Cape Town",
    "design store Cape Town",
    "printmaking studio Cape Town",
    "ceramics studio Cape Town",
]

MANUAL_NODES = [
    {
        "id": "b752b4c2-6da5-4bba-bdc1-5687db128123",
        "name": "Zeitz Museum of Contemporary Art Africa",
        "description": "Flagship contemporary art museum in the V&A Waterfront's Silo District.",
        "category": "museum",
        "lat": -33.9075,
        "lng": 18.4231,
        "radius_m": 120,
    },
    {
        "id": "af192d9c-9a0e-411b-a3c4-76f3842c1a06",
        "name": "V&A Waterfront Public Art Route",
        "description": "Outdoor sculptures and installations linking the marina boardwalks.",
        "category": "public_art",
        "lat": -33.9069,
        "lng": 18.4202,
        "radius_m": 120,
    },
    {
        "id": "c266874f-a61e-41fa-b0be-9e40e7f3d246",
        "name": "Battery Park Skate & Art Walls",
        "description": "Urban park with murals overlooking the canal and skate plaza.",
        "category": "public_art",
        "lat": -33.9095,
        "lng": 18.422,
        "radius_m": 70,
    },
    {
        "id": "e2b2e3a5-8c2d-4c5b-8f42-7e5d2e3c9f41",
        "name": "Watershed Art Market",
        "description": "Design and art market inside the V&A Waterfront's Watershed building.",
        "category": "art_shop",
        "lat": -33.9082,
        "lng": 18.4208,
        "radius_m": 70,
    },
]


def _normalize_ascii(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(normalized.split()).strip()


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return 2 * radius_km * math.asin(math.sqrt(a))


def _category_for_place(name: str, types: Iterable[str]) -> str:
    lower_name = name.lower()
    types_set = {t.lower() for t in types}
    if "museum" in types_set or "museum" in lower_name:
        return "museum"
    if "art_gallery" in types_set or "gallery" in lower_name:
        return "gallery"
    if "university" in types_set or "school" in types_set or "academy" in lower_name:
        return "art_school"
    if any(keyword in lower_name for keyword in ("monument", "memorial", "mural", "sculpture", "public art")):
        return "public_art"
    if "store" in types_set or "shopping_mall" in types_set or "shop" in lower_name:
        return "art_shop"
    if any(keyword in lower_name for keyword in ("studio", "atelier", "collective", "workspace")):
        return "studio"
    return "studio"


def _radius_for_category(category: str) -> int:
    if category == "museum":
        return 120
    if category == "public_art":
        return 110
    if category == "art_school":
        return 90
    return 70


def _min_rank_for_place(name: str, lat: float, lng: float) -> int:
    if name in RANK0_NAMES:
        return 0
    distance_km = _haversine_km(WATERFRONT_CENTER[0], WATERFRONT_CENTER[1], lat, lng)
    if distance_km <= 3.0:
        return 1
    return 2


def _places_text_search(
    client: httpx.Client,
    *,
    api_key: str,
    query: str,
    lat: float,
    lng: float,
    radius_m: int,
) -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    params = {"query": query, "location": f"{lat},{lng}", "radius": radius_m, "key": api_key}
    while True:
        response = client.get(PLACES_TEXTSEARCH_URL, params=params, timeout=30)
        response.raise_for_status()
        payload = response.json()
        status = payload.get("status")
        if status not in {"OK", "ZERO_RESULTS"}:
            details = payload.get("error_message", "")
            detail_suffix = f" ({details})" if details else ""
            raise RuntimeError(
                f"Places API error for '{query}' near {lat},{lng}: {status}{detail_suffix}"
            )
        results.extend(payload.get("results", []))
        next_token = payload.get("next_page_token")
        if not next_token:
            break
        time.sleep(2)
        params = {"pagetoken": next_token, "key": api_key}
    return results


def _load_existing_nodes(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def _dedupe_key(name: str, lat: float, lng: float) -> str:
    return f"{name.lower()}::{lat:.4f},{lng:.4f}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Cape Town seed nodes from Google Places.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[3] / "data" / "seed" / "nodes.json",
        help="Output JSON path for nodes.",
    )
    parser.add_argument("--radius", type=int, default=DEFAULT_RADIUS_M, help="Search radius in meters.")
    args = parser.parse_args()

    api_key = os.environ.get(PLACES_KEY_ENV, "").strip()
    if not api_key:
        raise SystemExit(
            f"Missing {PLACES_KEY_ENV}. Set it in the environment before running this script."
        )

    existing_nodes = _load_existing_nodes(args.output)
    existing_by_key: dict[str, dict[str, object]] = {}
    for node in existing_nodes:
        name = _normalize_ascii(str(node["name"]))
        key = _dedupe_key(name, float(node["lat"]), float(node["lng"]))
        existing_by_key[key] = node

    places: dict[str, dict[str, object]] = {}
    with httpx.Client() as client:
        for _, lat, lng in CAPETOWN_CENTERS:
            for query in SEARCH_QUERIES:
                for place in _places_text_search(
                    client, api_key=api_key, query=query, lat=lat, lng=lng, radius_m=args.radius
                ):
                    place_id = place.get("place_id")
                    if not place_id:
                        continue
                    places[str(place_id)] = place

    nodes: list[dict[str, object]] = []
    seen_keys: set[str] = set()

    for manual in MANUAL_NODES:
        node = dict(manual)
        node["min_rank"] = 0
        nodes.append(node)
        seen_keys.add(_dedupe_key(node["name"], float(node["lat"]), float(node["lng"])))

    for place in places.values():
        name = _normalize_ascii(str(place.get("name", "")).strip())
        geometry = place.get("geometry", {})
        location = geometry.get("location", {}) if isinstance(geometry, dict) else {}
        lat = location.get("lat")
        lng = location.get("lng")
        if not name or lat is None or lng is None:
            continue
        key = _dedupe_key(name, float(lat), float(lng))
        if key in seen_keys:
            continue

        existing = existing_by_key.get(key)
        if existing:
            node = dict(existing)
            node["min_rank"] = _min_rank_for_place(name, float(lat), float(lng))
            node["name"] = name
            seen_keys.add(key)
            nodes.append(node)
            continue

        types = place.get("types") or []
        category = _category_for_place(name, types)
        description = f"Listed on Google Places as a {category.replace('_', ' ')} in Cape Town."
        node = {
            "id": str(uuid.uuid5(UUID_NAMESPACE, str(place.get("place_id")))),
            "name": name,
            "description": description,
            "category": category,
            "lat": float(lat),
            "lng": float(lng),
            "radius_m": _radius_for_category(category),
            "min_rank": _min_rank_for_place(name, float(lat), float(lng)),
        }
        nodes.append(node)
        seen_keys.add(key)

    nodes.sort(key=lambda item: (int(item["min_rank"]), str(item["name"])))
    args.output.write_text(json.dumps(nodes, indent=2), encoding="utf-8")
    print(f"Wrote {len(nodes)} nodes to {args.output}")


if __name__ == "__main__":
    main()
