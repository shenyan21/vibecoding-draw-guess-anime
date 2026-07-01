import {
  isLobbyWalkablePoint,
  LOBBY_WALKABLE_BOUNDS,
  WARRIOR_COLORS,
  type Anime,
  type PlayerRoomView,
} from "@drawandguess/game-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomStore } from "../src/roomStore";

const catalog: Anime[] = Array.from({ length: 719 }, (_, index) => ({
  id: `anime_${index}`,
  subjectId: String(index),
  name: `动画 ${index}`,
  aliases: [],
  image: `/covers/${index}.webp`,
  date: "2024-01-01",
  score: 8,
  votes: 100,
  rank: index + 1,
  difficulty: "easy",
  tags: ["动画"],
  characters: [],
  sourceUrl: `https://example.com/${index}`,
}));

afterEach(() => vi.useRealTimers());

function setup(playerCount: number) {
  const store = new RoomStore(catalog);
  const identities = [store.createRoom("P1", playerCount)];
  for (let index = 1; index < playerCount; index += 1) {
    identities.push(store.joinRoom(identities[0].code, `P${index + 1}`));
  }
  for (let index = 1; index < playerCount; index += 1) {
    store.toggleReady(identities[0].code, identities[index].playerId);
  }
  store.startGame(identities[0].code, identities[0].playerId);
  return { store, identities, code: identities[0].code };
}

function submitTopics(store: RoomStore, code: string, identities: ReturnType<typeof setup>["identities"]) {
  const topics: string[] = [];
  identities.forEach((identity) => {
    const view = store.getView(code, identity.playerId);
    if (view.task?.kind !== "TOPIC") throw new Error("Expected topic task");
    const id = view.task.offer.anime[0].id;
    topics.push(id);
    store.submitTopic(code, identity.playerId, id);
  });
  return topics;
}

describe("RoomStore 完整流程", () => {
  it("房主打乱后的席位顺序决定后续传递顺序", () => {
    const store = new RoomStore(catalog);
    const identities = [store.createRoom("P1", 4)];
    for (let index = 1; index < 4; index += 1) {
      identities.push(store.joinRoom(identities[0].code, `P${index + 1}`));
    }

    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    store.shuffleSeats(identities[0].code, identities[0].playerId);
    random.mockRestore();

    const expectedSeatOrder = [identities[3], identities[0], identities[1], identities[2]].map((identity) => identity.playerId);
    const lobby = store.getView(identities[0].code, identities[0].playerId);
    expect(lobby.players.map((player) => player.id)).toEqual(expectedSeatOrder);
    expect(lobby.players.map((player) => player.seat)).toEqual([0, 1, 2, 3]);

    identities.slice(1).forEach((identity) => store.toggleReady(identities[0].code, identity.playerId));
    store.startGame(identities[0].code, identities[0].playerId);
    submitTopics(store, identities[0].code, identities);
    identities.forEach((identity) => {
      store.submitDrawing(identities[0].code, identity.playerId, "data:image/png;base64,AA==");
    });

    expectedSeatOrder.forEach((playerId, playerIndex) => {
      const view = store.getView(identities[0].code, playerId);
      if (view.task?.kind !== "GUESS") {
        throw new Error(`预期玩家 ${playerId} 收到 GUESS 任务`);
      }
      expect(view.task.fromPlayerId).toBe(expectedSeatOrder[(playerIndex - 1 + expectedSeatOrder.length) % expectedSeatOrder.length]);
    });
  });

  it("房间内创建和加入的玩家都出生在地图活动区域", () => {
    const store = new RoomStore(catalog);
    const identities = [store.createRoom("房主", 3)];
    identities.push(store.joinRoom(identities[0].code, "玩家二"));
    identities.push(store.joinRoom(identities[0].code, "玩家三"));

    const view = store.getView(identities[0].code, identities[0].playerId);
    expect(view.players).toHaveLength(3);
    view.players.forEach((player) => {
      expect(isLobbyWalkablePoint(player.x ?? -1, player.y ?? -1)).toBe(true);
      expect(WARRIOR_COLORS).toContain(player.warriorColor);
    });
  });

  it("正面攻击击退未防御玩家且不离开活动区域", () => {
    const store = new RoomStore(catalog);
    const host = store.createRoom("攻击者", 2);
    const target = store.joinRoom(host.code, "目标");
    store.updatePlayerPosition(host.code, host.playerId, 1300, 200, false, "idle");
    store.updatePlayerPosition(host.code, target.playerId, 1370, 200, true, "idle");

    const result = store.resolveWarriorAttack(host.code, host.playerId, 1000);
    expect(result?.impacts).toEqual([{
      playerId: target.playerId,
      fromX: 1370,
      fromY: 200,
      toX: LOBBY_WALKABLE_BOUNDS.maxX - 24,
      toY: 200,
      reflected: false,
    }]);
  });

  it("面向攻击者防御时反弹攻击者", () => {
    const store = new RoomStore(catalog);
    const host = store.createRoom("攻击者", 2);
    const target = store.joinRoom(host.code, "防御者");
    store.updatePlayerPosition(host.code, host.playerId, 700, 200, false, "idle");
    store.updatePlayerPosition(host.code, target.playerId, 760, 200, true, "guard");

    const result = store.resolveWarriorAttack(host.code, host.playerId, 1000);
    expect(result?.impacts).toEqual([{
      playerId: host.playerId,
      fromX: 700,
      fromY: 200,
      toX: 628,
      toY: 200,
      reflected: true,
    }]);
  });

  it("背对攻击者时防御无效", () => {
    const store = new RoomStore(catalog);
    const host = store.createRoom("攻击者", 2);
    const target = store.joinRoom(host.code, "背向防御者");
    store.updatePlayerPosition(host.code, host.playerId, 700, 200, false, "idle");
    store.updatePlayerPosition(host.code, target.playerId, 760, 200, false, "guard");

    const result = store.resolveWarriorAttack(host.code, host.playerId, 1000);
    expect(result?.impacts[0]).toMatchObject({ playerId: target.playerId, toX: 832, reflected: false });
  });

  for (const playerCount of [2, 3, 10]) {
    it(`${playerCount} 人并行轮次正常结束`, () => {
      vi.useFakeTimers();
      const { store, identities, code } = setup(playerCount);
      const topicIds = submitTopics(store, code, identities);
      expect(store.getView(code, identities[0].playerId).phase).toBe("DRAW");

      const totalRounds = playerCount % 2 === 0 ? playerCount : playerCount - 1;
      for (let round = 0; round < totalRounds; round += 1) {
        identities.forEach((identity) => {
          const view = store.getView(code, identity.playerId);
          if (view.task?.kind === "DRAW") {
            store.submitDrawing(code, identity.playerId, "data:image/png;base64,AA==");
          } else if (view.task?.kind === "GUESS") {
            expect(view.candidates).toHaveLength(200);
            expect(new Set(view.candidates.map((anime) => anime.id)).size).toBe(200);
            store.submitGuess(code, identity.playerId, view.candidates[round].id);
          } else {
            throw new Error(`Missing task in round ${round}`);
          }
        });
      }

      const reveal = store.getView(code, identities[0].playerId);
      expect(reveal.phase).toBe("VOTE");
      expect(reveal.chains).toHaveLength(playerCount);
      reveal.chains.forEach((chain) => {
        expect(chain.contributions).toHaveLength(totalRounds);
        expect(new Set(chain.contributions.map((entry) => entry.playerId)).size).toBe(totalRounds);
        expect(topicIds).toContain(chain.topic?.id);
      });
    });
  }

  it("刷新和猜测都不能逃逸本局候选池", () => {
    vi.useFakeTimers();
    const { store, identities, code } = setup(2);
    const first = store.getView(code, identities[0].playerId);
    if (first.task?.kind !== "TOPIC") throw new Error("Expected topic");
    store.refreshTopic(code, identities[0].playerId, 0);
    expect(() => store.refreshTopic(code, identities[0].playerId, 0)).toThrow("已刷新");
    submitTopics(store, code, identities);
    identities.forEach((identity) => store.submitDrawing(code, identity.playerId, "data:image/png;base64,AA=="));
    expect(() => store.submitGuess(code, identities[0].playerId, "anime_not_in_pool")).toThrow("200 个候选");
  });

  it("未提交玩家看不到其他玩家题目和传递链", () => {
    const { store, identities, code } = setup(2);
    const view: PlayerRoomView = store.getView(code, identities[0].playerId);
    expect(view.chains).toEqual([]);
    expect(view.candidates).toEqual([]);
    expect(view.task?.kind).toBe("TOPIC");
  });
});
