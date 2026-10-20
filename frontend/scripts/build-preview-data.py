"""Build a public static preview fixture from a fresh, seeded database."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient


FRONTEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(FRONTEND.parent / "backend"))

with tempfile.TemporaryDirectory(prefix="grow-public-preview-") as data_dir:
    os.environ["GROW_DATA_DIR"] = data_dir

    import app.main as main  # noqa: E402

    main.weather_is_stale = lambda: False
    with TestClient(main.app) as client:
        def get(path: str):
            response = client.get(f"/api/v1{path}")
            response.raise_for_status()
            return response.json()

        plantings = get("/plantings")
        fixture = {
            "dashboard": get("/dashboard"),
            "catalog": get("/catalog"),
            "plantings": plantings,
            "traces": {
                str(item["id"]): get(f"/plantings/{item['id']}/trace")
                for item in plantings
            },
        }

destination = FRONTEND / "public" / "preview-data.json"
destination.write_text(
    json.dumps(fixture, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8",
)
print(f"Created {destination} with {len(plantings)} demo plantings")
