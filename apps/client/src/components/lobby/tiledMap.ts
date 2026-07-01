export const TILED_LOBBY_MAP_URL = "/maps/island_02.json";

type TiledImage = {
  source: string;
  width: number;
  height: number;
};

type TiledAnimationFrame = {
  tileId: number;
  duration: number;
};

type TiledTile = {
  image?: TiledImage;
  animation?: TiledAnimationFrame[];
};

type TiledTileset = {
  firstGid: number;
  name: string;
  tileWidth: number;
  tileHeight: number;
  tileCount: number;
  columns: number;
  tileOffset: { x: number; y: number };
  image?: TiledImage;
  tiles: Record<string, TiledTile>;
};

type TiledLayer = {
  id: number;
  name: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
  visible: boolean;
  data: number[];
};

export type TiledMapData = {
  version: number;
  source: string;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
};

type DrawTile = {
  image: HTMLImageElement;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  drawWidth: number;
  drawHeight: number;
  offsetX: number;
  offsetY: number;
};

const FLIP_HORIZONTAL = 0x80000000;
const FLIP_VERTICAL = 0x40000000;
const FLIP_DIAGONAL = 0x20000000;
const GID_MASK = 0x1fffffff;

let mapPromise: Promise<TiledMapRenderer> | null = null;

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`地图图片加载失败：${source}`));
    image.src = source;
  });
}

function animationTileId(tileId: number, tile: TiledTile | undefined, time: number) {
  const animation = tile?.animation;
  if (!animation?.length) return tileId;
  const duration = animation.reduce((sum, frame) => sum + frame.duration, 0);
  let cursor = time % duration;
  for (const frame of animation) {
    if (cursor < frame.duration) return frame.tileId;
    cursor -= frame.duration;
  }
  return animation[animation.length - 1].tileId;
}

export class TiledMapRenderer {
  readonly width: number;
  readonly height: number;
  private readonly waterLayers: TiledLayer[];
  private readonly natureLayers: TiledLayer[];
  private readonly overlayLayers: TiledLayer[];
  private readonly images: Map<string, HTMLImageElement>;
  private readonly gidTilesets = new Map<number, TiledTileset>();

  constructor(private readonly map: TiledMapData, images: Map<string, HTMLImageElement>) {
    this.width = map.width * map.tileWidth;
    this.height = map.height * map.tileHeight;
    this.images = images;
    const baseLayers = map.layers.filter((layer) => layer.name !== "Clouds");
    this.overlayLayers = map.layers.filter((layer) => layer.name === "Clouds");
    const waterIndex = baseLayers.findIndex((layer) => layer.name === "Water Foam");
    const natureIndex = baseLayers.findIndex((layer) => layer.name === "Nature Decor");
    this.waterLayers = waterIndex >= 0 ? [baseLayers[waterIndex]] : [];
    this.natureLayers = natureIndex >= 0 ? baseLayers.slice(natureIndex) : [];

    for (const layer of map.layers) {
      for (const rawGid of layer.data) {
        const gid = (rawGid >>> 0) & GID_MASK;
        if (gid && !this.gidTilesets.has(gid)) this.gidTilesets.set(gid, this.findTileset(gid));
      }
    }
  }

  drawWater(ctx: CanvasRenderingContext2D, time: number) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    this.drawLayers(ctx, this.waterLayers, time);
  }

  drawNature(ctx: CanvasRenderingContext2D, time: number) {
    this.drawLayers(ctx, this.natureLayers, time);
  }

  drawOverlay(ctx: CanvasRenderingContext2D, time: number) {
    this.drawLayers(ctx, this.overlayLayers, time);
  }

  private drawLayers(ctx: CanvasRenderingContext2D, layers: TiledLayer[], time: number) {
    for (const layer of layers) {
      if (!layer.visible) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.translate(layer.offsetX, layer.offsetY);
      for (let index = 0; index < layer.data.length; index += 1) {
        const rawGid = layer.data[index] >>> 0;
        const gid = rawGid & GID_MASK;
        if (!gid) continue;
        const column = index % layer.width;
        const row = Math.floor(index / layer.width);
        this.drawTile(ctx, rawGid, gid, column, row, time);
      }
      ctx.restore();
    }
  }

  private drawTile(
    ctx: CanvasRenderingContext2D,
    rawGid: number,
    gid: number,
    column: number,
    row: number,
    time: number,
  ) {
    const tileset = this.gidTilesets.get(gid) ?? this.findTileset(gid);
    const baseTileId = gid - tileset.firstGid;
    const tileId = animationTileId(baseTileId, tileset.tiles[String(baseTileId)], time);
    const tile = this.resolveDrawTile(tileset, tileId);
    const drawX = column * this.map.tileWidth + tile.offsetX;
    const drawY = (row + 1) * this.map.tileHeight - tile.drawHeight + tile.offsetY;
    const horizontal = (rawGid & FLIP_HORIZONTAL) !== 0;
    const vertical = (rawGid & FLIP_VERTICAL) !== 0;
    const diagonal = (rawGid & FLIP_DIAGONAL) !== 0;

    if (!horizontal && !vertical && !diagonal) {
      ctx.drawImage(
        tile.image,
        tile.sourceX,
        tile.sourceY,
        tile.sourceWidth,
        tile.sourceHeight,
        drawX,
        drawY,
        tile.drawWidth,
        tile.drawHeight,
      );
      return;
    }

    ctx.save();
    ctx.translate(drawX + tile.drawWidth / 2, drawY + tile.drawHeight / 2);
    if (diagonal) ctx.rotate(Math.PI / 2);
    ctx.scale(horizontal ? -1 : 1, vertical ? -1 : 1);
    ctx.drawImage(
      tile.image,
      tile.sourceX,
      tile.sourceY,
      tile.sourceWidth,
      tile.sourceHeight,
      -tile.drawWidth / 2,
      -tile.drawHeight / 2,
      tile.drawWidth,
      tile.drawHeight,
    );
    ctx.restore();
  }

  private resolveDrawTile(tileset: TiledTileset, tileId: number): DrawTile {
    const standaloneImage = tileset.tiles[String(tileId)]?.image;
    if (standaloneImage) {
      return {
        image: this.getImage(standaloneImage.source),
        sourceX: 0,
        sourceY: 0,
        sourceWidth: standaloneImage.width,
        sourceHeight: standaloneImage.height,
        drawWidth: standaloneImage.width,
        drawHeight: standaloneImage.height,
        offsetX: tileset.tileOffset.x,
        offsetY: tileset.tileOffset.y,
      };
    }

    if (!tileset.image || !tileset.columns) throw new Error(`图块缺少图片：${tileset.name}#${tileId}`);
    return {
      image: this.getImage(tileset.image.source),
      sourceX: (tileId % tileset.columns) * tileset.tileWidth,
      sourceY: Math.floor(tileId / tileset.columns) * tileset.tileHeight,
      sourceWidth: tileset.tileWidth,
      sourceHeight: tileset.tileHeight,
      drawWidth: tileset.tileWidth,
      drawHeight: tileset.tileHeight,
      offsetX: tileset.tileOffset.x,
      offsetY: tileset.tileOffset.y,
    };
  }

  private findTileset(gid: number) {
    for (let index = this.map.tilesets.length - 1; index >= 0; index -= 1) {
      if (gid >= this.map.tilesets[index].firstGid) return this.map.tilesets[index];
    }
    throw new Error(`找不到 GID ${gid} 对应的图块集`);
  }

  private getImage(source: string) {
    const image = this.images.get(source);
    if (!image) throw new Error(`地图图片尚未加载：${source}`);
    return image;
  }
}

export function loadTiledLobbyMap() {
  if (!mapPromise) {
    mapPromise = fetch(TILED_LOBBY_MAP_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`地图数据加载失败：HTTP ${response.status}`);
        return response.json() as Promise<TiledMapData>;
      })
      .then(async (map) => {
        const sources = new Set<string>();
        for (const tileset of map.tilesets) {
          if (tileset.image) sources.add(tileset.image.source);
          for (const tile of Object.values(tileset.tiles)) {
            if (tile.image) sources.add(tile.image.source);
          }
        }
        const images = await Promise.all([...sources].map(async (source) => [source, await loadImage(source)] as const));
        return new TiledMapRenderer(map, new Map(images));
      })
      .catch((error) => {
        mapPromise = null;
        throw error;
      });
  }
  return mapPromise;
}
