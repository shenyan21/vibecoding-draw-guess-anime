import {
  isLobbyWalkablePoint,
  LOBBY_MAP,
  WARRIOR_COLORS,
  type LobbyAttackResolution,
  type PlayerRoomView,
} from "@drawandguess/game-core";
import { useEffect, useRef, useState } from "react";
import { socket } from "../store/roomStore";
import { loadTiledLobbyMap, type TiledMapRenderer } from "./lobby/tiledMap";

type PlayerPosition = {
  x: number;
  y: number;
  isLeft: boolean;
  animState: string;
  actionStartedAt: number;
  actionUntil: number;
  attackReadyAt: number;
  knockback?: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    startedAt: number;
    duration: number;
  };
};

type LobbyRuntime = {
  map: TiledMapRenderer;
  sprites: Map<string, HTMLImageElement>;
};

const MOVE_KEYS = new Set(["w", "a", "s", "d"]);
const PLAYER_MOVE_SPEED = 2;
const ATTACK_DURATION_MS = 400;
const ATTACK_COOLDOWN_MS = 500;
const KNOCKBACK_DURATION_MS = 480;
let runtimePromise: Promise<LobbyRuntime> | null = null;

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`玩家图片加载失败：${source}`));
    image.src = source;
  });
}

function loadLobbyRuntime() {
  if (!runtimePromise) {
    const sprites = WARRIOR_COLORS.flatMap((color) => [
      [`${color}_Idle`, `/tiny-swords/Tiny Swords (Free Pack)/Units/${color} Units/Warrior/Warrior_Idle.png`] as const,
      [`${color}_Run`, `/tiny-swords/Tiny Swords (Free Pack)/Units/${color} Units/Warrior/Warrior_Run.png`] as const,
      [`${color}_Attack`, `/tiny-swords/Tiny Swords (Free Pack)/Units/${color} Units/Warrior/Warrior_Attack1.png`] as const,
      [`${color}_Guard`, `/tiny-swords/Tiny Swords (Free Pack)/Units/${color} Units/Warrior/Warrior_Guard.png`] as const,
    ]);
    runtimePromise = Promise.all([
      loadTiledLobbyMap(),
      Promise.all(sprites.map(async ([key, source]) => [key, await loadImage(source)] as const)),
    ])
      .then(([map, loadedSprites]) => ({ map, sprites: new Map(loadedSprites) }))
      .catch((error) => {
        runtimePromise = null;
        throw error;
      });
  }
  return runtimePromise;
}

function fallbackSpawn(seat: number) {
  const column = seat % LOBBY_MAP.walkableColumns;
  return {
    x: (LOBBY_MAP.walkableStartColumn - 1 + column) * LOBBY_MAP.tileSize + LOBBY_MAP.tileSize / 2,
    y: (LOBBY_MAP.walkableStartRow - 1) * LOBBY_MAP.tileSize + LOBBY_MAP.tileSize / 2,
  };
}

export function TiledLobbyGame({
  view,
  interactionDisabled = false,
}: {
  view: PlayerRoomView;
  interactionDisabled?: boolean;
}) {
  const waterCanvasRef = useRef<HTMLCanvasElement>(null);
  const actorCanvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<LobbyRuntime | null>(null);
  const positionsRef = useRef<Record<string, PlayerPosition>>({});
  const keysRef = useRef<Record<string, boolean>>({});
  const lastSentRef = useRef({ x: Number.NaN, y: Number.NaN, animState: "", at: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    const startTime = Date.now();
    loadLobbyRuntime()
      .then((runtime) => {
        if (!active) return;
        runtimeRef.current = runtime;
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 800 - elapsed);
        setTimeout(() => {
          if (!active) return;
          setStatus("ready");
        }, remaining);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "地图加载失败");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    for (const player of view.players) {
      if (positionsRef.current[player.id]) continue;
      const fallback = fallbackSpawn(player.seat);
      const x = player.x ?? fallback.x;
      const y = player.y ?? fallback.y;
      positionsRef.current[player.id] = {
        x: isLobbyWalkablePoint(x, y) ? x : fallback.x,
        y: isLobbyWalkablePoint(x, y) ? y : fallback.y,
        isLeft: player.isLeft ?? false,
        animState: player.animState ?? "idle",
        actionStartedAt: 0,
        actionUntil: 0,
        attackReadyAt: 0,
      };
    }
    const activeIds = new Set(view.players.map((player) => player.id));
    for (const playerId of Object.keys(positionsRef.current)) {
      if (!activeIds.has(playerId)) delete positionsRef.current[playerId];
    }
  }, [view.players]);

  useEffect(() => {
    const onPlayerMoved = (data: { playerId: string; x: number; y: number; isLeft: boolean; animState: string }) => {
      if (data.playerId === view.selfId || !isLobbyWalkablePoint(data.x, data.y)) return;
      const existing = positionsRef.current[data.playerId];
      if (existing?.knockback) {
        // 击退由本地逐帧插值驱动；忽略被击玩家每 50ms 回传的位置，避免观察端出现分段瞬移。
        existing.isLeft = data.isLeft;
        return;
      }
      const now = performance.now();
      const attackStarted = data.animState === "attack" && existing?.animState !== "attack";
      positionsRef.current[data.playerId] = {
        x: data.x,
        y: data.y,
        isLeft: data.isLeft,
        animState: data.animState,
        actionStartedAt: attackStarted ? now : existing?.actionStartedAt ?? 0,
        actionUntil: attackStarted ? now + ATTACK_DURATION_MS : existing?.actionUntil ?? 0,
        attackReadyAt: existing?.attackReadyAt ?? 0,
        knockback: existing?.knockback,
      };
    };
    const onPlayerAttacked = (resolution: LobbyAttackResolution) => {
      const now = performance.now();
      const attackerPosition = positionsRef.current[resolution.attackerId];
      if (attackerPosition) {
        attackerPosition.animState = "attack";
        attackerPosition.actionStartedAt = now;
        attackerPosition.actionUntil = now + ATTACK_DURATION_MS;
        attackerPosition.attackReadyAt = now + ATTACK_COOLDOWN_MS;
      }
      for (const impact of resolution.impacts) {
        const position = positionsRef.current[impact.playerId];
        if (!position) continue;
        position.x = impact.fromX;
        position.y = impact.fromY;
        position.knockback = {
          fromX: impact.fromX,
          fromY: impact.fromY,
          toX: impact.toX,
          toY: impact.toY,
          startedAt: now,
          duration: KNOCKBACK_DURATION_MS,
        };
        if (!impact.reflected) position.animState = "idle";
      }
    };
    socket.on("player:moved", onPlayerMoved);
    socket.on("player:attacked", onPlayerAttacked);
    return () => {
      socket.off("player:moved", onPlayerMoved);
      socket.off("player:attacked", onPlayerAttacked);
    };
  }, [view.selfId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']") || interactionDisabled) return;
      const key = event.key.toLowerCase();
      if (MOVE_KEYS.has(key)) {
        keysRef.current[key] = true;
        return;
      }
      if (key === "k") {
        event.preventDefault();
        keysRef.current.k = true;
        const position = positionsRef.current[view.selfId];
        if (position && !position.knockback && position.animState !== "attack") {
          position.animState = "guard";
          sendPlayerPosition(position, lastSentRef.current, true);
        }
        return;
      }
      if (key === "j" && !event.repeat) {
        event.preventDefault();
        const position = positionsRef.current[view.selfId];
        if (startWarriorAttack(position, keysRef.current, performance.now())) {
          sendPlayerPosition(position!, lastSentRef.current, true);
          socket.emit("player:attack");
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = false;
    };
    const onBlur = () => {
      keysRef.current = {};
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [interactionDisabled, view.selfId]);

  useEffect(() => {
    if (!interactionDisabled) return;
    keysRef.current = {};
    const position = positionsRef.current[view.selfId];
    if (!position) return;
    position.animState = "idle";
    position.actionUntil = 0;
    position.knockback = undefined;
    socket.emit("player:move", { x: position.x, y: position.y, isLeft: position.isLeft, animState: "idle" });
  }, [interactionDisabled, view.selfId]);

  useEffect(() => {
    if (status !== "ready") return;
    let frameId = 0;
    const tick = (time: number) => {
      updatePlayerPosition(positionsRef.current[view.selfId], keysRef.current, interactionDisabled, time);
      sendPlayerPosition(positionsRef.current[view.selfId], lastSentRef.current);
      drawLobby(
        waterCanvasRef.current,
        actorCanvasRef.current,
        runtimeRef.current,
        view,
        positionsRef.current,
        time,
      );
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [interactionDisabled, status, view]);

  return (
    <div className="lobby-game-panel island-lobby tiled-lobby" aria-label="多人岛屿房间">
      <div className="canvas-wrapper tiled-lobby-canvas-wrapper">
        <div
          className="lobby-canvas island-lobby-canvas tiled-lobby-canvas tiled-lobby-background"
          aria-label="30 乘 35 格岛屿地图"
        />
        <canvas
          ref={waterCanvasRef}
          width={LOBBY_MAP.width * LOBBY_MAP.tileSize}
          height={LOBBY_MAP.height * LOBBY_MAP.tileSize}
          className="tiled-lobby-layer-canvas tiled-lobby-water-canvas"
          aria-hidden="true"
        />
        <img className="tiled-lobby-ground-image" src="/maps/island_02_ground.png" alt="" aria-hidden="true" />
        <canvas
          ref={actorCanvasRef}
          width={LOBBY_MAP.width * LOBBY_MAP.tileSize}
          height={LOBBY_MAP.height * LOBBY_MAP.tileSize}
          className="tiled-lobby-actor-canvas"
          aria-hidden="true"
        />
        {status !== "ready" ? (
          <div className="loading-screen" role="status">
            <span style={{ fontSize: "14px", fontWeight: "bold", color: "var(--cyan)", letterSpacing: "0.15em" }}>DG</span>
            <div className="loading-bar">
              <i />
            </div>
            <strong>{status === "error" ? errorMessage : "载入岛屿地图中"}</strong>
          </div>
        ) : null}
      </div>
      <div className="island-controls tiled-lobby-controls" aria-label="移动方式">
        <kbd>WASD</kbd>
        <span>移动</span>
        <kbd>J</kbd>
        <span>攻击</span>
        <kbd>K</kbd>
        <span>防御</span>
      </div>
    </div>
  );
}

function updatePlayerPosition(
  position: PlayerPosition | undefined,
  keys: Record<string, boolean>,
  interactionDisabled: boolean,
  time: number,
) {
  if (!position) return;
  if (position.knockback) {
    const motion = position.knockback;
    const progress = Math.min(1, (time - motion.startedAt) / motion.duration);
    const eased = progress * progress * (3 - 2 * progress);
    position.x = motion.fromX + (motion.toX - motion.fromX) * eased;
    position.y = motion.fromY + (motion.toY - motion.fromY) * eased;
    if (progress >= 1) position.knockback = undefined;
    return;
  }
  if (interactionDisabled) return;
  if (position.actionUntil > time) {
    position.animState = "attack";
    return;
  }
  if (keys.k) {
    position.animState = "guard";
    return;
  }

  let moveX = 0;
  let moveY = 0;
  if (keys.w) moveY -= PLAYER_MOVE_SPEED;
  if (keys.s) moveY += PLAYER_MOVE_SPEED;
  if (keys.a) moveX -= PLAYER_MOVE_SPEED;
  if (keys.d) moveX += PLAYER_MOVE_SPEED;

  if (moveX && moveY) {
    moveX *= Math.SQRT1_2;
    moveY *= Math.SQRT1_2;
  }

  if (moveX || moveY) {
    moveWithinBounds(position, position.x + moveX, position.y + moveY);
    position.animState = "run";
    if (moveX) position.isLeft = moveX < 0;
    return;
  }

  position.animState = "idle";
}

function startWarriorAttack(
  position: PlayerPosition | undefined,
  keys: Record<string, boolean>,
  time: number,
) {
  if (!position || position.knockback || keys.k || position.animState === "guard" || position.attackReadyAt > time) return false;
  position.animState = "attack";
  position.actionStartedAt = time;
  position.actionUntil = time + ATTACK_DURATION_MS;
  position.attackReadyAt = time + ATTACK_COOLDOWN_MS;
  return true;
}

function moveWithinBounds(position: PlayerPosition, nextX: number, nextY: number) {
  if (isLobbyWalkablePoint(nextX, position.y)) position.x = nextX;
  if (isLobbyWalkablePoint(position.x, nextY)) position.y = nextY;
}

function sendPlayerPosition(
  position: PlayerPosition | undefined,
  lastSent: { x: number; y: number; animState: string; at: number },
  force = false,
) {
  if (!position) return;
  const now = performance.now();
  const moved = !Number.isFinite(lastSent.x) || Math.hypot(position.x - lastSent.x, position.y - lastSent.y) >= 2;
  const stateChanged = lastSent.animState !== position.animState;
  if (!force && !stateChanged && (!moved || now - lastSent.at < 50)) return;
  socket.emit("player:move", {
    x: position.x,
    y: position.y,
    isLeft: position.isLeft,
    animState: position.animState,
  });
  lastSent.x = position.x;
  lastSent.y = position.y;
  lastSent.animState = position.animState;
  lastSent.at = now;
}

function drawLobby(
  waterCanvas: HTMLCanvasElement | null,
  actorCanvas: HTMLCanvasElement | null,
  runtime: LobbyRuntime | null,
  view: PlayerRoomView,
  positions: Record<string, PlayerPosition>,
  time: number,
) {
  if (!waterCanvas || !actorCanvas || !runtime) return;
  const waterContext = waterCanvas.getContext("2d");
  const ctx = actorCanvas.getContext("2d");
  if (!waterContext || !ctx) return;
  waterContext.imageSmoothingEnabled = false;
  runtime.map.drawWater(waterContext, time);
  ctx.clearRect(0, 0, actorCanvas.width, actorCanvas.height);
  ctx.imageSmoothingEnabled = false;
  runtime.map.drawNature(ctx, time);

  const players = [...view.players].sort((left, right) => (positions[left.id]?.y ?? 0) - (positions[right.id]?.y ?? 0));
  for (const player of players) {
    const position = positions[player.id];
    if (!position) continue;
    const color = player.warriorColor ?? WARRIOR_COLORS[player.seat % WARRIOR_COLORS.length];
    const animation = position.animState === "attack"
      ? { key: "Attack", frames: 4, looping: false }
      : position.animState === "guard"
        ? { key: "Guard", frames: 6, looping: true }
        : position.animState === "run"
          ? { key: "Run", frames: 6, looping: true }
          : { key: "Idle", frames: 8, looping: true };
    const sheet = runtime.sprites.get(`${color}_${animation.key}`);
    if (!sheet) continue;
    const frame = animation.looping
      ? Math.floor(time / 100) % animation.frames
      : Math.min(animation.frames - 1, Math.floor(Math.max(0, time - position.actionStartedAt) / 100));
    const isSelf = player.id === view.selfId;

    ctx.save();
    if (position.knockback) {
      const motion = position.knockback;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.36)";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(motion.fromX, motion.fromY - 22);
      ctx.lineTo(position.x, position.y - 22);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.ellipse(position.x, position.y + 2, 20, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(position.x, position.y - 24);
    if (position.knockback) {
      const knockbackDirection = Math.sign(position.knockback.toX - position.knockback.fromX) || 1;
      ctx.rotate(knockbackDirection * 0.1);
    }
    if (position.isLeft) ctx.scale(-1, 1);
    ctx.drawImage(sheet, frame * 192, 0, 192, 192, -56, -56, 112, 112);
    ctx.restore();

    const label = player.name;
    ctx.save();
    ctx.font = "800 13px Inter, 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    const width = Math.max(54, ctx.measureText(label).width + 20);
    const labelY = position.y - 92;
    ctx.fillStyle = isSelf ? "rgba(5, 39, 58, 0.94)" : "rgba(9, 24, 37, 0.9)";
    ctx.strokeStyle = isSelf ? "#71e8ff" : "rgba(255, 255, 255, 0.32)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(position.x - width / 2, labelY - 17, width, 25, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f7fbff";
    ctx.fillText(label, position.x, labelY);
    if (player.isHost) {
      ctx.fillStyle = "#f8bd45";
      ctx.beginPath();
      ctx.moveTo(position.x - 9, labelY - 22);
      ctx.lineTo(position.x - 6, labelY - 31);
      ctx.lineTo(position.x, labelY - 25);
      ctx.lineTo(position.x + 6, labelY - 31);
      ctx.lineTo(position.x + 9, labelY - 22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  runtime.map.drawOverlay(ctx, time);
}
