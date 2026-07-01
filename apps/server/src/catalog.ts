import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Anime } from "@drawandguess/game-core";

const catalogPath = fileURLToPath(
  new URL("../../client/public/anime/catalog.json", import.meta.url),
);

export function loadCatalog(): Anime[] {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Anime[];
  if (catalog.length < 200) throw new Error("动画题库不足 200 条");
  return catalog;
}
