import { randomBytes } from "node:crypto";
import type {
  Anime,
  Chain,
  GamePhase,
  LobbyAttackResolution,
  Player,
  PlayerRoomView,
  TopicOffer,
} from "@drawandguess/game-core";
import {
  clampLobbyPoint,
  createLobbySpawn,
  getChainIndexForPlayer,
  getTaskKind,
  randomWarriorColor,
  sampleUnique,
} from "@drawandguess/game-core";

type InternalPlayer = Omit<Player, "submitted"> & { token: string };

type Room = {
  code: string;
  capacity: number;
  hostId: string;
  phase: GamePhase;
  players: InternalPlayer[];
  submitted: Set<string>;
  roundIndex: number;
  candidates: Anime[];
  chains: Chain[];
  offers: Map<string, TopicOffer>;
  revealStartedAt: number | null;
  revealTimer: ReturnType<typeof setTimeout> | null;
  drawDuration: number;
  guessDuration: number;
  roundEndsAt: number | null;
  roundTimer: ReturnType<typeof setTimeout> | null;
  playerPositions: Map<string, { x: number; y: number; isLeft: boolean; animState: string }>;
  playerAttackReadyAt: Map<string, number>;
};

export type RoomIdentity = { code: string; playerId: string; token: string };

const REVEAL_ITEM_DURATION_MS = 3000;
const WARRIOR_ATTACK_COOLDOWN_MS = 500;
const VOTE_DURATION_SECONDS = 30; // 投票倒计时时长 (30秒)
const WARRIOR_ATTACK_RANGE = 96;
const WARRIOR_ATTACK_HALF_HEIGHT = 36;
const WARRIOR_KNOCKBACK_DISTANCE = 72;
const WARRIOR_COLLISION_INSET = 24;

function makeId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function makeRoomCode(): string {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 10).toString()).join("");
}

export class RoomStore {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly catalog: Anime[],
    private readonly onChange: (code: string) => void = () => undefined,
  ) {}

  createRoom(name: string, capacity: number): RoomIdentity {
    const cleanName = this.validateName(name);
    if (!Number.isInteger(capacity) || capacity < 2 || capacity > 10) {
      throw new Error("人数必须为 2～10");
    }
    let code = makeRoomCode();
    while (this.rooms.has(code)) code = makeRoomCode();
    const playerId = makeId("player");
    const token = makeId("token");
    const player: InternalPlayer = {
      id: playerId,
      token,
      name: cleanName,
      seat: 0,
      connected: true,
      isHost: true,
      warriorColor: randomWarriorColor(),
    };
    const { x, y } = createLobbySpawn();
    const playerPositions = new Map<string, { x: number; y: number; isLeft: boolean; animState: string }>();
    playerPositions.set(playerId, { x, y, isLeft: false, animState: "idle" });

    const room: Room = {
      code,
      capacity,
      hostId: playerId,
      phase: "LOBBY",
      players: [player],
      submitted: new Set(),
      roundIndex: -1,
      candidates: [],
      chains: [],
      offers: new Map(),
      revealStartedAt: null,
      revealTimer: null,
      drawDuration: 180,
      guessDuration: 60,
      roundEndsAt: null,
      roundTimer: null,
      playerPositions,
      playerAttackReadyAt: new Map(),
    };
    this.rooms.set(code, room);

    return { code, playerId, token };
  }

  joinRoom(codeInput: string, name: string): RoomIdentity {
    const code = codeInput.trim().toUpperCase();
    const room = this.getRoom(code);
    if (room.phase !== "LOBBY") throw new Error("游戏已开始");
    if (room.players.length >= room.capacity) throw new Error("房间已满");
    const cleanName = this.validateName(name);
    if (room.players.some((player) => player.name === cleanName)) throw new Error("昵称已存在");
    const playerId = makeId("player");
    const token = makeId("token");

    const occupiedSeats = new Set(room.players.map((p) => p.seat));
    let newSeat = 0;
    while (occupiedSeats.has(newSeat)) newSeat++;

    room.players.push({
      id: playerId,
      token,
      name: cleanName,
      seat: newSeat,
      connected: true,
      isHost: false,
      warriorColor: randomWarriorColor(),
    });
    room.players.sort((a, b) => a.seat - b.seat);
    const { x, y } = createLobbySpawn();
    room.playerPositions.set(playerId, { x, y, isLeft: false, animState: "idle" });
    this.onChange(code);
    return { code, playerId, token };
  }

  resume(identity: RoomIdentity): PlayerRoomView {
    const room = this.getRoom(identity.code.toUpperCase());
    const player = room.players.find(
      (entry) => entry.id === identity.playerId && entry.token === identity.token,
    );
    if (!player) throw new Error("玩家凭证已失效");
    player.connected = true;
    this.onChange(room.code);
    return this.getView(room.code, player.id);
  }

  disconnect(identity: RoomIdentity): void {
    const room = this.rooms.get(identity.code);
    const player = room?.players.find(
      (entry) => entry.id === identity.playerId && entry.token === identity.token,
    );
    if (player) {
      player.connected = false;
      this.onChange(room!.code);
    }
  }

  setCapacity(code: string, playerId: string, capacity: number): void {
    const room = this.getRoom(code);
    this.assertHost(room, playerId);
    if (room.phase !== "LOBBY") throw new Error("游戏已开始");
    if (!Number.isInteger(capacity) || capacity < room.players.length || capacity > 10 || capacity < 2) {
      throw new Error("目标人数无效");
    }
    room.capacity = capacity;
    this.onChange(room.code);
  }

  setSettings(code: string, playerId: string, drawDuration: number, guessDuration: number): void {
    const room = this.getRoom(code);
    this.assertHost(room, playerId);
    if (room.phase !== "LOBBY") throw new Error("游戏已开始，无法修改设置");
    room.drawDuration = Math.max(10, Math.min(600, drawDuration));
    room.guessDuration = Math.max(5, Math.min(300, guessDuration));
    this.onChange(room.code);
  }

  shuffleSeats(code: string, playerId: string): void {
    const room = this.getRoom(code);
    this.assertHost(room, playerId);
    if (room.phase !== "LOBBY") throw new Error("游戏已开始，无法调整位置");

    const seats = room.players.map((_, i) => i);
    for (let i = seats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seats[i], seats[j]] = [seats[j], seats[i]];
    }

    room.players.forEach((player, index) => {
      player.seat = seats[index];
    });
    room.players.sort((a, b) => a.seat - b.seat);
    this.onChange(room.code);
  }

  returnToLobby(code: string, playerId: string): void {
    const room = this.getRoom(code);
    this.assertHost(room, playerId);
    room.phase = "LOBBY";
    room.submitted.clear();
    room.roundIndex = -1;
    room.chains = [];
    room.offers.clear();
    room.revealStartedAt = null;
    if (room.revealTimer) {
      clearTimeout(room.revealTimer);
      room.revealTimer = null;
    }
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    room.roundEndsAt = null;
    this.onChange(room.code);
  }

  startGame(code: string, playerId: string): void {
    const room = this.getRoom(code);
    this.assertHost(room, playerId);
    if (room.players.length < 2 || room.players.length > 10) throw new Error("游戏需要 2-10 名玩家参与");
    if (room.players.some((player) => !player.connected)) throw new Error("有玩家未连接");
    const guestPlayers = room.players.filter((p) => p.id !== room.hostId);
    if (!guestPlayers.every((p) => room.submitted.has(p.id))) {
      throw new Error("等待所有玩家准备");
    }
    if (room.revealTimer) clearTimeout(room.revealTimer);

    // 玩家数组顺序是传递链环形调度的唯一索引来源，开局前必须与房间席位一致。
    room.players.sort((a, b) => a.seat - b.seat);
    room.candidates = sampleUnique(this.catalog, 200);
    room.chains = room.players.map((player) => ({
      id: makeId("chain"),
      creatorPlayerId: player.id,
      topic: null,
      contributions: [],
      votes: {},
      outcome: null,
    }));
    room.offers.clear();
    const offerPool = sampleUnique(room.candidates, room.players.length * 3);
    room.players.forEach((player, index) => {
      room.offers.set(player.id, {
        anime: offerPool.slice(index * 3, index * 3 + 3),
        refreshed: [false, false, false],
      });
    });
    room.phase = "TOPIC";
    room.roundIndex = -1;
    room.submitted.clear();
    room.revealStartedAt = null;
    room.roundEndsAt = null;
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    this.onChange(room.code);
  }

  refreshTopic(code: string, playerId: string, position: number): void {
    const room = this.getRoom(code);
    this.assertAction(room, playerId, "TOPIC");
    const offer = room.offers.get(playerId)!;
    if (!Number.isInteger(position) || position < 0 || position > 2) throw new Error("题目位置无效");
    if (offer.refreshed[position]) throw new Error("该位置已刷新");
    const unavailable = new Set(offer.anime.map((anime) => anime.id));
    const replacement = sampleUnique(
      room.candidates.filter((anime) => !unavailable.has(anime.id)),
      1,
    )[0];
    offer.anime[position] = replacement;
    offer.refreshed[position] = true;
    this.onChange(room.code);
  }

  submitTopic(code: string, playerId: string, animeId: string): void {
    const room = this.getRoom(code);
    this.assertAction(room, playerId, "TOPIC");
    const offer = room.offers.get(playerId)!;
    const anime = offer.anime.find((entry) => entry.id === animeId);
    if (!anime) throw new Error("只能选择当前三个题目");
    const chain = room.chains.find((entry) => entry.creatorPlayerId === playerId)!;
    chain.topic = anime;
    room.submitted.add(playerId);
    this.advanceIfReady(room);
    this.onChange(room.code);
  }

  submitDrawing(code: string, playerId: string, drawing: string, strokes?: string): void {
    const room = this.getRoom(code);
    this.assertAction(room, playerId, "DRAW");
    if (!drawing.startsWith("data:image/png;base64,") || drawing.length > 2_500_000) {
      throw new Error("画布数据无效或过大");
    }
    const playerIndex = room.players.findIndex((player) => player.id === playerId);
    const chain = room.chains[getChainIndexForPlayer(playerIndex, room.roundIndex, room.players.length)];
    chain.contributions.push({
      kind: "DRAW",
      index: room.roundIndex,
      playerId,
      drawing,
      strokes,
    });
    room.submitted.add(playerId);
    this.advanceIfReady(room);
    this.onChange(room.code);
  }

  submitGuess(code: string, playerId: string, animeId: string): void {
    const room = this.getRoom(code);
    this.assertAction(room, playerId, "GUESS");
    const anime = room.candidates.find((entry) => entry.id === animeId);
    if (!anime) throw new Error("答案必须来自本局 200 个候选");
    const playerIndex = room.players.findIndex((player) => player.id === playerId);
    const chain = room.chains[getChainIndexForPlayer(playerIndex, room.roundIndex, room.players.length)];
    chain.contributions.push({
      kind: "GUESS",
      index: room.roundIndex,
      playerId,
      anime,
    });
    room.submitted.add(playerId);
    this.advanceIfReady(room);
    this.onChange(room.code);
  }

  vote(code: string, playerId: string, chainId: string, choice: "success" | "failure"): void {
    const room = this.getRoom(code);
    if (room.phase !== "VOTE") throw new Error("当前不能投票");
    const chain = room.chains.find((entry) => entry.id === chainId);
    if (!chain) throw new Error("传递链不存在");
    if (chain.votes[playerId]) throw new Error("您已为该链投过票");
    chain.votes[playerId] = choice;

    const currentChainFinished = Object.keys(chain.votes).length === room.players.length;
    const expected = room.players.length * room.chains.length;
    const actual = room.chains.reduce((sum, entry) => sum + Object.keys(entry.votes).length, 0);

    if (actual === expected) {
      room.chains.forEach((entry) => {
        const values = Object.values(entry.votes);
        const success = values.filter((value) => value === "success").length;
        entry.outcome = success > values.length / 2 ? "success" : "failure";
      });
      room.phase = "RESULTS";
      room.roundEndsAt = null;
      if (room.roundTimer) {
        clearTimeout(room.roundTimer);
        room.roundTimer = null;
      }
    } else if (currentChainFinished) {
      // 当前这一条链已经投满，但还有未投满的链，重置并为下一条链开启投票计时！
      this.startVoteTimer(room);
    }
    this.onChange(room.code);
  }

  getView(code: string, playerId: string): PlayerRoomView {
    const room = this.getRoom(code);
    const playerIndex = room.players.findIndex((player) => player.id === playerId);
    if (playerIndex < 0) throw new Error("玩家不在房间内");
    const submitted = room.submitted.has(playerId);
    let task: PlayerRoomView["task"] = null;

    if (!submitted && room.phase === "TOPIC") {
      task = { kind: "TOPIC", offer: room.offers.get(playerId)! };
    } else if (!submitted && (room.phase === "DRAW" || room.phase === "GUESS")) {
      const chain = room.chains[
        getChainIndexForPlayer(playerIndex, room.roundIndex, room.players.length)
      ];
      if (room.phase === "DRAW") {
        const previous = chain.contributions.at(-1);
        const source = room.roundIndex === 0 ? chain.topic : previous?.kind === "GUESS" ? previous.anime : null;
        if (!source) throw new Error("绘画题目缺失");
        task = {
          kind: "DRAW",
          source,
          fromPlayerId: room.roundIndex === 0 ? chain.creatorPlayerId : previous?.playerId,
        };
      } else {
        const previous = chain.contributions.at(-1);
        if (previous?.kind !== "DRAW") throw new Error("上一棒绘画缺失");
        task = { kind: "GUESS", drawing: previous.drawing, fromPlayerId: previous.playerId };
      }
    }

    const publicChains = ["REVEAL", "VOTE", "RESULTS"].includes(room.phase) ? room.chains : [];
    return {
      code: room.code,
      capacity: room.capacity,
      phase: room.phase,
      hostId: room.hostId,
      selfId: playerId,
      players: room.players.map((player) => {
        const pos = room.playerPositions?.get(player.id) || { x: 960, y: 288, isLeft: false, animState: "idle" };
        return {
          id: player.id,
          name: player.name,
          seat: player.seat,
          connected: player.connected,
          isHost: player.isHost,
          submitted: room.submitted.has(player.id),
          x: pos.x,
          y: pos.y,
          isLeft: pos.isLeft,
          animState: pos.animState,
          warriorColor: player.warriorColor,
        };
      }),
      roundIndex: room.roundIndex,
      totalRounds: room.players.length % 2 === 0 ? room.players.length : room.players.length - 1,
      task,
      candidates: room.phase === "GUESS" ? room.candidates : [],
      chains: publicChains,
      revealStartedAt: room.revealStartedAt,
      revealItemDurationMs: REVEAL_ITEM_DURATION_MS,
      drawDuration: room.drawDuration,
      guessDuration: room.guessDuration,
      roundEndsAt: room.roundEndsAt,
    };
  }

  getPlayerIds(code: string): string[] {
    return this.getRoom(code).players.map((player) => player.id);
  }

  private advanceIfReady(room: Room): void {
    if (room.submitted.size !== room.players.length) return;
    room.submitted.clear();
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    room.roundEndsAt = null;
    this.advanceRound(room);
  }

  private advanceRound(room: Room): void {
    if (room.phase === "TOPIC") {
      room.roundIndex = 0;
      this.startRound(room, "DRAW");
      return;
    }
    const maxRounds = room.players.length % 2 === 0 ? room.players.length : room.players.length - 1;
    if (room.roundIndex + 1 < maxRounds) {
      room.roundIndex += 1;
      this.startRound(room, getTaskKind(room.roundIndex));
      return;
    }
    room.phase = "VOTE";
    this.startVoteTimer(room);
  }

  private startVoteTimer(room: Room): void {
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }

    room.roundEndsAt = Date.now() + VOTE_DURATION_SECONDS * 1000;

    room.roundTimer = setTimeout(() => {
      // 投票超时自动补票
      const activeChain = room.chains.find(
        (chain) => Object.keys(chain.votes).length < room.players.length
      );
      if (!activeChain) return;

      room.players.forEach((p) => {
        if (!activeChain.votes[p.id]) {
          activeChain.votes[p.id] = "success";
        }
      });

      const expected = room.players.length * room.chains.length;
      const actual = room.chains.reduce((sum, entry) => sum + Object.keys(entry.votes).length, 0);

      if (actual === expected) {
        room.chains.forEach((entry) => {
          const values = Object.values(entry.votes);
          const success = values.filter((value) => value === "success").length;
          entry.outcome = success > values.length / 2 ? "success" : "failure";
        });
        room.phase = "RESULTS";
        room.roundEndsAt = null;
        room.roundTimer = null;
      } else {
        // 继续开启下一条链的计时
        this.startVoteTimer(room);
      }
      this.onChange(room.code);
    }, VOTE_DURATION_SECONDS * 1000);
  }

  private startRound(room: Room, phase: "DRAW" | "GUESS"): void {
    room.phase = phase;
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }

    const duration = phase === "DRAW" ? (room.drawDuration || 180) : (room.guessDuration || 60);
    room.roundEndsAt = Date.now() + duration * 1000;

    room.roundTimer = setTimeout(() => {
      // 倒计时结束，强行提交未操作玩家的数据
      room.players.forEach((p) => {
        if (room.submitted.has(p.id)) return;

        const playerIndex = room.players.findIndex((player) => player.id === p.id);
        const chain = room.chains[
          getChainIndexForPlayer(playerIndex, room.roundIndex, room.players.length)
        ];

        if (phase === "DRAW") {
          const dummyDrawing = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
          chain.contributions.push({
            kind: "DRAW",
            index: room.roundIndex,
            playerId: p.id,
            drawing: dummyDrawing,
          });
        } else {
          // 猜测阶段默认选择第一项候选
          const fallbackAnime = room.candidates[0] || {
            id: "fallback",
            subjectId: "fallback",
            name: "未知动漫",
            aliases: [],
            image: "",
            date: "",
            score: 0,
            votes: 0,
            rank: 9999,
            difficulty: "easy",
            tags: [],
            characters: [],
            sourceUrl: ""
          };
          chain.contributions.push({
            kind: "GUESS",
            index: room.roundIndex,
            playerId: p.id,
            anime: fallbackAnime,
          });
        }
        room.submitted.add(p.id);
      });

      room.submitted.clear();
      room.roundEndsAt = null;
      room.roundTimer = null;
      this.advanceRound(room);
      this.onChange(room.code);
    }, duration * 1000);
  }

  private assertAction(room: Room, playerId: string, expected: GamePhase): void {
    if (room.phase !== expected) throw new Error("当前阶段不能执行该操作");
    if (!room.players.some((player) => player.id === playerId)) throw new Error("玩家不在房间内");
    if (room.submitted.has(playerId)) throw new Error("本轮已经提交");
  }

  private assertHost(room: Room, playerId: string): void {
    if (room.hostId !== playerId) throw new Error("仅房主可操作");
  }

  private getRoom(codeInput: string): Room {
    const code = codeInput.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new Error("房间不存在");
    return room;
  }

  private validateName(name: string): string {
    const cleanName = name.trim().slice(0, 12);
    if (cleanName.length < 1) throw new Error("请输入昵称");
    return cleanName;
  }

  updatePlayerPosition(code: string, playerId: string, x: number, y: number, isLeft: boolean, animState: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.playerPositions.set(playerId, { x, y, isLeft, animState });
  }

  resolveWarriorAttack(code: string, playerId: string, now = Date.now()): LobbyAttackResolution | null {
    const room = this.rooms.get(code);
    if (!room || room.phase !== "LOBBY") return null;
    const attacker = room.players.find((player) => player.id === playerId && player.connected);
    const attackerPosition = room.playerPositions.get(playerId);
    if (!attacker || !attackerPosition) return null;
    if ((room.playerAttackReadyAt.get(playerId) ?? 0) > now) return null;
    room.playerAttackReadyAt.set(playerId, now + WARRIOR_ATTACK_COOLDOWN_MS);

    const direction = attackerPosition.isLeft ? -1 : 1;
    const originX = attackerPosition.x;
    const originY = attackerPosition.y;
    const impacts: LobbyAttackResolution["impacts"] = [];
    let reflected = false;

    for (const target of room.players) {
      if (target.id === playerId || !target.connected) continue;
      const targetPosition = room.playerPositions.get(target.id);
      if (!targetPosition) continue;
      const forwardDistance = (targetPosition.x - originX) * direction;
      const verticalDistance = Math.abs(targetPosition.y - originY);
      if (forwardDistance < 0 || forwardDistance > WARRIOR_ATTACK_RANGE || verticalDistance > WARRIOR_ATTACK_HALF_HEIGHT) continue;

      const targetFacesAttacker = targetPosition.isLeft ? originX < targetPosition.x : originX > targetPosition.x;
      if (targetPosition.animState === "guard" && targetFacesAttacker) {
        if (reflected) continue;
        reflected = true;
        const destination = clampLobbyPoint(
          originX - direction * WARRIOR_KNOCKBACK_DISTANCE,
          originY,
          WARRIOR_COLLISION_INSET,
        );
        impacts.push({
          playerId,
          fromX: originX,
          fromY: originY,
          toX: destination.x,
          toY: destination.y,
          reflected: true,
        });
        continue;
      }

      const destination = clampLobbyPoint(
        targetPosition.x + direction * WARRIOR_KNOCKBACK_DISTANCE,
        targetPosition.y,
        WARRIOR_COLLISION_INSET,
      );
      impacts.push({
        playerId: target.id,
        fromX: targetPosition.x,
        fromY: targetPosition.y,
        toX: destination.x,
        toY: destination.y,
        reflected: false,
      });
      room.playerPositions.set(target.id, { ...targetPosition, x: destination.x, y: destination.y });
    }

    if (reflected) {
      const impact = impacts.find((entry) => entry.reflected);
      if (impact) room.playerPositions.set(playerId, { ...attackerPosition, x: impact.toX, y: impact.toY, animState: "attack" });
    } else {
      room.playerPositions.set(playerId, { ...attackerPosition, animState: "attack" });
    }

    return { attackerId: playerId, occurredAt: now, impacts };
  }

  toggleReady(code: string, playerId: string): void {
    const room = this.getRoom(code);
    if (room.phase !== "LOBBY") throw new Error("当前阶段不能执行该操作");
    if (room.submitted.has(playerId)) {
      room.submitted.delete(playerId);
    } else {
      room.submitted.add(playerId);
    }
    this.onChange(room.code);
  }

  swapSeats(code: string, hostPlayerId: string, fromSeat: number, toSeat: number): void {
    const room = this.getRoom(code);
    this.assertHost(room, hostPlayerId);
    if (room.phase !== "LOBBY") throw new Error("当前阶段不能执行该操作");
    if (fromSeat < 0 || fromSeat >= room.capacity || toSeat < 0 || toSeat >= room.capacity) {
      throw new Error("席位无效");
    }
    const p1 = room.players.find((p) => p.seat === fromSeat);
    const p2 = room.players.find((p) => p.seat === toSeat);
    if (!p1 && !p2) return;
    if (p1 && p2) {
      p1.seat = toSeat;
      p2.seat = fromSeat;
    } else if (p1) {
      p1.seat = toSeat;
    } else if (p2) {
      p2.seat = fromSeat;
    }
    room.players.sort((a, b) => a.seat - b.seat);
    this.onChange(room.code);
  }

  kickPlayer(code: string, hostPlayerId: string, targetPlayerId: string): void {
    const room = this.getRoom(code);
    this.assertHost(room, hostPlayerId);
    if (room.phase !== "LOBBY") throw new Error("当前阶段不能执行该操作");
    if (targetPlayerId === hostPlayerId) throw new Error("不能踢出自己");
    const index = room.players.findIndex((p) => p.id === targetPlayerId);
    if (index !== -1) {
      room.players.splice(index, 1);
      room.playerPositions.delete(targetPlayerId);
      room.playerAttackReadyAt.delete(targetPlayerId);
      this.onChange(room.code);
    }
  }
}
