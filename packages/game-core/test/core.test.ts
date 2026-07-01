import { describe, expect, it } from "vitest";
import {
  clampLobbyPoint,
  createLobbySpawn,
  getChainIndexForPlayer,
  getExpectedPlayerIndex,
  getTaskKind,
  isLobbyWalkablePoint,
  LOBBY_WALKABLE_BOUNDS,
  randomWarriorColor,
  sampleUnique,
} from "../src/index";

describe("并行传递调度", () => {
  for (const playerCount of [2, 3, 10]) {
    it(`${playerCount} 人时每条链恰好经过全部玩家`, () => {
      for (let chain = 0; chain < playerCount; chain += 1) {
        const players = Array.from({ length: playerCount }, (_, round) =>
          getExpectedPlayerIndex(chain, round, playerCount),
        );
        expect(new Set(players).size).toBe(playerCount);
        players.forEach((player, round) => {
          expect(getChainIndexForPlayer(player, round, playerCount)).toBe(chain);
        });
      }
    });
  }

  it("奇偶轮次严格交替", () => {
    expect(Array.from({ length: 6 }, (_, index) => getTaskKind(index))).toEqual([
      "DRAW",
      "GUESS",
      "DRAW",
      "GUESS",
      "DRAW",
      "GUESS",
    ]);
  });

  it("候选池固定为 200 个不重复条目", () => {
    const source = Array.from({ length: 719 }, (_, index) => index);
    const result = sampleUnique(source, 200, () => 0.42);
    expect(result).toHaveLength(200);
    expect(new Set(result).size).toBe(200);
  });
});

describe("房间地图活动区域", () => {
  it("只允许第 2～8 行、第 9～22 列 (向内收缩 32px)", () => {
    expect(isLobbyWalkablePoint(544, 96)).toBe(true);
    expect(isLobbyWalkablePoint(1375.99, 479.99)).toBe(true);
    expect(isLobbyWalkablePoint(543.99, 96)).toBe(false);
    expect(isLobbyWalkablePoint(1376, 480)).toBe(false);
  });

  it("随机出生点保留半格边距并始终位于活动区域", () => {
    const minimum = createLobbySpawn(() => 0);
    const maximum = createLobbySpawn(() => 0.999999);
    expect(minimum).toEqual({ x: 576, y: 128 });
    expect(maximum.x).toBeLessThan(LOBBY_WALKABLE_BOUNDS.maxX - 31);
    expect(maximum.y).toBeLessThan(LOBBY_WALKABLE_BOUNDS.maxY - 31);
    expect(isLobbyWalkablePoint(maximum.x, maximum.y)).toBe(true);
  });

  it("击退目标会被裁剪在原活动区域内", () => {
    expect(clampLobbyPoint(9999, -9999, 24)).toEqual({
      x: LOBBY_WALKABLE_BOUNDS.maxX - 24,
      y: LOBBY_WALKABLE_BOUNDS.minY + 24,
    });
  });

  it("五种 Warrior 颜色都可被稳定抽取", () => {
    expect([0, 0.2, 0.4, 0.6, 0.999].map((value) => randomWarriorColor(() => value))).toEqual([
      "Black",
      "Blue",
      "Purple",
      "Red",
      "Yellow",
    ]);
  });
});
