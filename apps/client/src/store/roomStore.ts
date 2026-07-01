import type { PlayerRoomView } from "@drawandguess/game-core";
import { io } from "socket.io-client";
import { create } from "zustand";

type Identity = { code: string; playerId: string; token: string };
type Ack<T = unknown> = { ok: boolean; data?: T; error?: string };

type RoomStore = {
  view: PlayerRoomView | null;
  connected: boolean;
  error: string | null;
  clearError: () => void;
};

const STORAGE_KEY = "drawandguess.identity.v2";
const serverUrl = import.meta.env.VITE_SERVER_URL;
export const socket = io(serverUrl || undefined, {
  autoConnect: true,
  transports: ["websocket", "polling"],
});

export const useRoomStore = create<RoomStore>((set) => ({
  view: null,
  connected: socket.connected,
  error: null,
  clearError: () => set({ error: null }),
}));

socket.on("connect", () => {
  useRoomStore.setState({ connected: true });
  const identity = getIdentity();
  if (identity) socket.emit("room:resume", identity, () => undefined);
});
socket.on("disconnect", () => useRoomStore.setState({ connected: false }));
socket.on("room:view", (view: PlayerRoomView) => useRoomStore.setState({ view, error: null }));
socket.on("room:error", (error: string) => useRoomStore.setState({ error }));
socket.on("room:kicked", () => {
  sessionStorage.removeItem(STORAGE_KEY);
  useRoomStore.setState({ view: null, error: "你已被踢出房间" });
  window.location.href = "/";
});

function getIdentity(): Identity | null {
  const value = sessionStorage.getItem(STORAGE_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as Identity;
  } catch {
    return null;
  }
}

function request<T>(event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, ...args, (ack: Ack<T>) => {
      if (ack.ok) resolve(ack.data as T);
      else reject(new Error(ack.error || "操作失败"));
    });
  });
}

async function enter(event: "room:create" | "room:join", ...args: unknown[]): Promise<Identity> {
  const identity = await request<Identity>(event, ...args);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export const roomActions = {
  create: (name: string, capacity: number) => enter("room:create", name, capacity),
  join: (code: string, name: string) => enter("room:join", code, name),
  setCapacity: (capacity: number) => request<void>("room:capacity", capacity),
  setSettings: (drawDuration: number, guessDuration: number) => request<void>("room:settings", { drawDuration, guessDuration }),
  shuffleSeats: () => request<void>("room:shuffle-seats"),
  start: () => request<void>("game:start"),
  ready: () => request<void>("player:ready"),
  swapSeats: (fromSeat: number, toSeat: number) => request<void>("room:swap-seats", { fromSeat, toSeat }),
  kickPlayer: (playerId: string) => request<void>("room:kick-player", playerId),
  refreshTopic: (position: number) => request<void>("topic:refresh", position),
  submitTopic: (animeId: string) => request<void>("topic:submit", animeId),
  submitDrawing: (drawing: string, strokes?: string) => request<void>("draw:submit", { drawing, strokes }),
  submitGuess: (animeId: string) => request<void>("guess:submit", animeId),
  vote: (chainId: string, choice: "success" | "failure") =>
    request<void>("vote:submit", chainId, choice),
  restart: () => request<void>("game:restart"),
};
