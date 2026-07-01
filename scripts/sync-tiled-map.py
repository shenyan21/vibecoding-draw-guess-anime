from __future__ import annotations

import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image


DEFAULT_SOURCE = Path(r"E:\codex_project\tinyswordsproject\maps\island_02.tmx")
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "apps/client/public/maps/island_02.json"


def runtime_image_path(source: Path) -> str:
    parts = source.resolve().parts
    try:
        assets_index = next(index for index, part in enumerate(parts) if part.lower() == "assets")
    except StopIteration as error:
        raise ValueError(f"图块图片不在 assets 目录中：{source}") from error
    relative = "/".join(parts[assets_index + 1 :])
    return f"/tiny-swords/{relative}"


def int_attr(element: ET.Element, name: str, default: int = 0) -> int:
    return int(element.attrib.get(name, default))


def parse_image(element: ET.Element, base_dir: Path) -> dict[str, object]:
    return {
        "source": runtime_image_path(base_dir / element.attrib["source"]),
        "width": int_attr(element, "width"),
        "height": int_attr(element, "height"),
    }


def parse_tileset(reference: ET.Element, map_dir: Path) -> dict[str, object]:
    source_path = (map_dir / reference.attrib["source"]).resolve()
    root = ET.parse(source_path).getroot()
    tile_offset = root.find("tileoffset")
    image = root.find("image")
    tiles: dict[str, object] = {}

    for tile in root.findall("tile"):
        entry: dict[str, object] = {}
        tile_image = tile.find("image")
        animation = tile.find("animation")
        if tile_image is not None:
            entry["image"] = parse_image(tile_image, source_path.parent)
        if animation is not None:
            entry["animation"] = [
                {
                    "tileId": int_attr(frame, "tileid"),
                    "duration": int_attr(frame, "duration"),
                }
                for frame in animation.findall("frame")
            ]
        if entry:
            tiles[tile.attrib["id"]] = entry

    result: dict[str, object] = {
        "firstGid": int(reference.attrib["firstgid"]),
        "name": root.attrib["name"],
        "tileWidth": int_attr(root, "tilewidth"),
        "tileHeight": int_attr(root, "tileheight"),
        "tileCount": int_attr(root, "tilecount"),
        "columns": int_attr(root, "columns"),
        "tileOffset": {
            "x": int_attr(tile_offset, "x") if tile_offset is not None else 0,
            "y": int_attr(tile_offset, "y") if tile_offset is not None else 0,
        },
        "tiles": tiles,
    }
    if image is not None:
        result["image"] = parse_image(image, source_path.parent)
    return result


def parse_layer(layer: ET.Element) -> dict[str, object]:
    data = layer.find("data")
    if data is None or data.attrib.get("encoding") != "csv":
        raise ValueError(f"仅支持 CSV 图层：{layer.attrib.get('name', 'unnamed')}")
    values = [int(value.strip()) for value in (data.text or "").split(",") if value.strip()]
    width = int_attr(layer, "width")
    height = int_attr(layer, "height")
    if len(values) != width * height:
        raise ValueError(f"图层尺寸不匹配：{layer.attrib.get('name', 'unnamed')}")
    return {
        "id": int_attr(layer, "id"),
        "name": layer.attrib.get("name", ""),
        "width": width,
        "height": height,
        "offsetX": float(layer.attrib.get("offsetx", "0")),
        "offsetY": float(layer.attrib.get("offsety", "0")),
        "opacity": float(layer.attrib.get("opacity", "1")),
        "visible": layer.attrib.get("visible", "1") != "0",
        "data": values,
    }


def convert(source: Path) -> dict[str, object]:
    root = ET.parse(source).getroot()
    if root.attrib.get("orientation") != "orthogonal":
        raise ValueError("仅支持 orthogonal Tiled 地图")
    return {
        "version": 1,
        "source": source.name,
        "width": int_attr(root, "width"),
        "height": int_attr(root, "height"),
        "tileWidth": int_attr(root, "tilewidth"),
        "tileHeight": int_attr(root, "tileheight"),
        "layers": [parse_layer(layer) for layer in root.findall("layer")],
        "tilesets": [parse_tileset(reference, source.parent) for reference in root.findall("tileset")],
    }


def render_static_ground(map_data: dict[str, object], output: Path) -> None:
    width = int(map_data["width"])
    height = int(map_data["height"])
    tile_width = int(map_data["tileWidth"])
    tile_height = int(map_data["tileHeight"])
    canvas = Image.new("RGBA", (width * tile_width, height * tile_height), (0, 0, 0, 0))
    public_root = output.parent.parent
    tilesets = sorted(map_data["tilesets"], key=lambda tileset: int(tileset["firstGid"]))
    image_cache: dict[str, Image.Image] = {}

    def get_image(source: str) -> Image.Image:
        if source not in image_cache:
            image_cache[source] = Image.open(public_root / source.lstrip("/")).convert("RGBA")
        return image_cache[source]

    def find_tileset(gid: int) -> dict[str, object]:
        selected = tilesets[0]
        for tileset in tilesets:
            if gid < int(tileset["firstGid"]):
                break
            selected = tileset
        return selected

    static_layers = [
        layer
        for layer in map_data["layers"]
        if layer["name"] not in {"BG Color", "Water Foam", "Nature Decor", "Clouds"}
        and layer["visible"]
    ]
    for layer in static_layers:
        for index, raw_gid in enumerate(layer["data"]):
            gid = int(raw_gid) & 0x1FFFFFFF
            if gid == 0:
                continue
            tileset = find_tileset(gid)
            tile_id = gid - int(tileset["firstGid"])
            image_data = tileset.get("image")
            if not image_data:
                continue
            source = get_image(str(image_data["source"]))
            columns = int(tileset["columns"])
            source_width = int(tileset["tileWidth"])
            source_height = int(tileset["tileHeight"])
            source_x = (tile_id % columns) * source_width
            source_y = (tile_id // columns) * source_height
            tile = source.crop((source_x, source_y, source_x + source_width, source_y + source_height))
            column = index % int(layer["width"])
            row = index // int(layer["width"])
            draw_x = round(column * tile_width + float(tileset["tileOffset"]["x"]) + float(layer["offsetX"]))
            draw_y = round(
                (row + 1) * tile_height
                - source_height
                + float(tileset["tileOffset"]["y"])
                + float(layer["offsetY"])
            )
            canvas.alpha_composite(tile, (draw_x, draw_y))

    canvas.save(output, optimize=True)
    for image in image_cache.values():
        image.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="将 Tiled TMX/TSX 转为房间运行时 JSON")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if not args.source.exists():
        raise FileNotFoundError(f"找不到地图：{args.source}")
    result = convert(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ground_output = args.output.with_name(f"{args.output.stem}_ground.png")
    render_static_ground(result, ground_output)
    print(f"已同步 {args.source} -> {args.output} + {ground_output}")


if __name__ == "__main__":
    main()
