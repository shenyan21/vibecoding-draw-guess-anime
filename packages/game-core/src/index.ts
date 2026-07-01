export type Difficulty = "easy" | "medium" | "hard";
export const WARRIOR_COLORS = ["Black", "Blue", "Purple", "Red", "Yellow"] as const;
export type WarriorColor = (typeof WARRIOR_COLORS)[number];

export type Anime = {
  id: string;
  subjectId: string;
  name: string;
  aliases: string[];
  image: string;
  date: string;
  score: number;
  votes: number;
  rank: number;
  difficulty: Difficulty;
  tags: string[];
  characters: string[];
  sourceUrl: string;
};

export type Player = {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  isHost: boolean;
  submitted: boolean;
  x?: number;
  y?: number;
  isLeft?: boolean;
  animState?: string;
  warriorColor?: WarriorColor;
};

export const LOBBY_MAP = {
  width: 30,
  height: 35,
  tileSize: 64,
  walkableStartRow: 2,
  walkableStartColumn: 9,
  walkableRows: 7,
  walkableColumns: 14,
} as const;

export const LOBBY_WALKABLE_BOUNDS = {
  minX: (LOBBY_MAP.walkableStartColumn - 1) * LOBBY_MAP.tileSize + 32,
  maxX: (LOBBY_MAP.walkableStartColumn - 1 + LOBBY_MAP.walkableColumns) * LOBBY_MAP.tileSize - 32,
  minY: (LOBBY_MAP.walkableStartRow - 1) * LOBBY_MAP.tileSize + 32,
  maxY: (LOBBY_MAP.walkableStartRow - 1 + LOBBY_MAP.walkableRows) * LOBBY_MAP.tileSize - 32,
} as const;

export function isLobbyWalkablePoint(x: number, y: number) {
  return x >= LOBBY_WALKABLE_BOUNDS.minX
    && x < LOBBY_WALKABLE_BOUNDS.maxX
    && y >= LOBBY_WALKABLE_BOUNDS.minY
    && y < LOBBY_WALKABLE_BOUNDS.maxY;
}

export function createLobbySpawn(random: () => number = Math.random) {
  const inset = LOBBY_MAP.tileSize / 2;
  const minX = LOBBY_WALKABLE_BOUNDS.minX + inset;
  const maxX = LOBBY_WALKABLE_BOUNDS.maxX - inset;
  const minY = LOBBY_WALKABLE_BOUNDS.minY + inset;
  const maxY = LOBBY_WALKABLE_BOUNDS.maxY - inset;
  return {
    x: Math.floor(minX + random() * (maxX - minX)),
    y: Math.floor(minY + random() * (maxY - minY)),
  };
}

export function randomWarriorColor(random: () => number = Math.random): WarriorColor {
  const index = Math.min(WARRIOR_COLORS.length - 1, Math.floor(random() * WARRIOR_COLORS.length));
  return WARRIOR_COLORS[index];
}

export function clampLobbyPoint(x: number, y: number, inset = 0) {
  return {
    x: Math.max(LOBBY_WALKABLE_BOUNDS.minX + inset, Math.min(LOBBY_WALKABLE_BOUNDS.maxX - inset, x)),
    y: Math.max(LOBBY_WALKABLE_BOUNDS.minY + inset, Math.min(LOBBY_WALKABLE_BOUNDS.maxY - inset, y)),
  };
}

export type LobbyCombatImpact = {
  playerId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  reflected: boolean;
};

export type LobbyAttackResolution = {
  attackerId: string;
  occurredAt: number;
  impacts: LobbyCombatImpact[];
};


export type DrawContribution = {
  kind: "DRAW";
  index: number;
  playerId: string;
  drawing: string;
  strokes?: string;
};

export type GuessContribution = {
  kind: "GUESS";
  index: number;
  playerId: string;
  anime: Anime;
};

export type Contribution = DrawContribution | GuessContribution;

export type Chain = {
  id: string;
  creatorPlayerId: string;
  topic: Anime | null;
  contributions: Contribution[];
  votes: Record<string, "success" | "failure">;
  outcome: "success" | "failure" | null;
};

export type TopicOffer = {
  anime: Anime[];
  refreshed: boolean[];
};

export type PlayerTask =
  | { kind: "TOPIC"; offer: TopicOffer }
  | { kind: "DRAW"; source: Anime; fromPlayerId?: string }
  | { kind: "GUESS"; drawing: string; fromPlayerId?: string }
  | null;

export type GamePhase =
  | "LOBBY"
  | "TOPIC"
  | "DRAW"
  | "GUESS"
  | "REVEAL"
  | "VOTE"
  | "RESULTS";

export type PlayerRoomView = {
  code: string;
  capacity: number;
  phase: GamePhase;
  players: Player[];
  selfId: string;
  hostId: string;
  roundIndex: number;
  totalRounds: number;
  task: PlayerTask;
  candidates: Anime[];
  chains: Chain[];
  revealStartedAt: number | null;
  revealItemDurationMs: number;
  drawDuration: number;
  guessDuration: number;
  roundEndsAt: number | null;
  error?: string;
};

export const getTaskKind = (roundIndex: number): "DRAW" | "GUESS" =>
  roundIndex % 2 === 0 ? "DRAW" : "GUESS";

export function getChainIndexForPlayer(
  playerIndex: number,
  roundIndex: number,
  playerCount: number,
): number {
  if (playerCount < 2 || playerCount > 10) {
    throw new Error("玩家数量必须为 2～10 人");
  }
  if (playerIndex < 0 || playerIndex >= playerCount || roundIndex < 0) {
    throw new Error("玩家或轮次索引无效");
  }
  return (playerIndex - roundIndex + playerCount) % playerCount;
}

export function getExpectedPlayerIndex(
  chainIndex: number,
  contributionIndex: number,
  playerCount: number,
): number {
  return (chainIndex + contributionIndex) % playerCount;
}

export function sampleUnique<T>(items: readonly T[], count: number, random = Math.random): T[] {
  if (count > items.length) throw new Error("候选数量超过题库大小");
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy.slice(0, count);
}
