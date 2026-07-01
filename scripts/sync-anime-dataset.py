"""Build a compact, project-local anime manifest and cover set.

Source defaults to the adjacent hextech-bisyllable-duel repository. The command is
idempotent and intentionally keeps the source data untouched.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from PIL import Image


def subject_id(url: str) -> str:
    match = re.search(r"/subject/(\d+)", url)
    if not match:
        raise ValueError(f"Invalid Bangumi subject URL: {url}")
    return match.group(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(r"E:\codex_project\hextech-bisyllable-duel\data\anime"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1]
        / "apps"
        / "client"
        / "public"
        / "anime",
    )
    args = parser.parse_args()

    source_json = args.source / "bangumi_slim_dataset.json"
    cover_source = args.source / "covers"
    cover_output = args.output / "covers"
    cover_output.mkdir(parents=True, exist_ok=True)

    records = json.loads(source_json.read_text(encoding="utf-8"))
    cover_by_order = {
        path.name.split("_", 1)[0]: path for path in cover_source.glob("*.jpg")
    }
    manifest: list[dict[str, object]] = []

    for record in records:
        sid = subject_id(record["url"])
        order = int(record["order"])
        source_cover = cover_by_order.get(f"{order:04d}")
        if source_cover is None:
            raise FileNotFoundError(f"Missing cover for order {order}")

        output_name = f"{sid}.webp"
        output_cover = cover_output / output_name
        if not output_cover.exists():
            with Image.open(source_cover) as image:
                image = image.convert("RGB")
                image.thumbnail((480, 720), Image.Resampling.LANCZOS)
                image.save(output_cover, "WEBP", quality=82, method=6)

        score = float(record.get("score") or 0)
        difficulty = "easy" if order <= 200 else "medium" if order <= 500 else "hard"
        manifest.append(
            {
                "id": f"bgm_{sid}",
                "subjectId": sid,
                "name": record.get("name_cn") or f"Bangumi {sid}",
                "aliases": [],
                "image": f"/anime/covers/{output_name}",
                "date": record.get("date") or "",
                "score": score,
                "votes": int(record.get("total_votes") or 0),
                "rank": order,
                "difficulty": difficulty,
                "tags": list(record.get("tags") or [])[:30],
                "characters": [
                    character.get("name", "")
                    if isinstance(character, dict)
                    else str(character)
                    for character in (record.get("characters") or [])[:16]
                ],
                "sourceUrl": record["url"],
            }
        )

    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "catalog.json").write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Synced {len(manifest)} anime to {args.output}")


if __name__ == "__main__":
    main()
