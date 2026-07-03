import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import type { RoomIdentity } from "./roomStore";
import { loadCatalog } from "./catalog";
import { RoomStore } from "./roomStore";

const PORT = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === "production";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.get("/health", (_request, response) => response.json({ ok: true }));

// Serve static frontend files in production
if (isProduction) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const distPath = join(__dirname, "..", "..", "client", "dist");

  if (existsSync(distPath)) {
    app.use(express.static(distPath, { maxAge: "1d" }));
    // SPA fallback: serve index.html for non-API routes
    // Express 5 uses regex or path-to-regexp syntax, not "*"
    app.get(/^(?!\/socket\.io|\/health).*/, (_req, res) => {
      res.sendFile(join(distPath, "index.html"));
    });
    console.log(`Serving static files from: ${distPath}`);
  } else {
    console.warn(`Static files not found at: ${distPath}`);
  }
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: 3_000_000,
  pingTimeout: 60000,
  pingInterval: 25000,
});

const identities = new Map<string, RoomIdentity>();
const store = new RoomStore(loadCatalog(), (code) => broadcast(code));

function broadcast(code: string): void {
  for (const socket of io.sockets.sockets.values()) {
    const identity = identities.get(socket.id);
    if (identity?.code === code) {
      try {
        socket.emit("room:view", store.getView(code, identity.playerId));
      } catch {
        // The socket can disappear between iteration and emit.
      }
    }
  }
}

function withAck<T extends unknown[]>(
  socketId: string,
  action: (...args: T) => unknown,
) {
  return (...args: [...T, (result: { ok: boolean; data?: unknown; error?: string }) => void]) => {
    const ack = args.pop() as (result: { ok: boolean; data?: unknown; error?: string }) => void;
    try {
      const data = action(...(args as unknown as T));
      ack({ ok: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败";
      io.sockets.sockets.get(socketId)?.emit("room:error", message);
      ack({ ok: false, error: message });
    }
  };
}

io.on("connection", (socket) => {
  socket.on(
    "room:create",
    withAck(socket.id, (name: string, capacity: number) => {
      const identity = store.createRoom(name, capacity);
      identities.set(socket.id, identity);
      socket.join(identity.code);
      socket.emit("room:view", store.getView(identity.code, identity.playerId));
      return identity;
    }),
  );
  socket.on(
    "room:join",
    withAck(socket.id, (code: string, name: string) => {
      const identity = store.joinRoom(code, name);
      identities.set(socket.id, identity);
      socket.join(identity.code);
      socket.emit("room:view", store.getView(identity.code, identity.playerId));
      return identity;
    }),
  );
  socket.on(
    "room:resume",
    withAck(socket.id, (identity: RoomIdentity) => {
      const view = store.resume(identity);
      identities.set(socket.id, identity);
      socket.join(identity.code);
      socket.emit("room:view", view);
      return identity;
    }),
  );

  const identityAction = <T extends unknown[]>(action: (identity: RoomIdentity, ...args: T) => void) =>
    withAck(socket.id, (...args: T) => {
      const identity = identities.get(socket.id);
      if (!identity) throw new Error("请先进入房间");
      action(identity, ...args);
    });

  socket.on("room:capacity", identityAction((identity, capacity: number) => store.setCapacity(identity.code, identity.playerId, capacity)));
  socket.on("room:settings", identityAction((identity, data: { drawDuration: number; guessDuration: number }) => store.setSettings(identity.code, identity.playerId, data.drawDuration, data.guessDuration)));
  socket.on("room:shuffle-seats", identityAction((identity) => store.shuffleSeats(identity.code, identity.playerId)));
  socket.on("game:start", identityAction((identity) => store.startGame(identity.code, identity.playerId)));
  socket.on("player:ready", identityAction((identity) => store.toggleReady(identity.code, identity.playerId)));
  socket.on("room:swap-seats", identityAction((identity, data: { fromSeat: number; toSeat: number }) => store.swapSeats(identity.code, identity.playerId, data.fromSeat, data.toSeat)));
  socket.on("room:kick-player", identityAction((identity, targetPlayerId: string) => {
    store.kickPlayer(identity.code, identity.playerId, targetPlayerId);
    for (const [sid, ident] of identities.entries()) {
      if (ident.playerId === targetPlayerId && ident.code === identity.code) {
        const targetSocket = io.sockets.sockets.get(sid);
        if (targetSocket) {
          targetSocket.emit("room:kicked");
          targetSocket.leave(identity.code);
        }
        identities.delete(sid);
      }
    }
  }));
  socket.on("topic:refresh", identityAction((identity, position: number) => store.refreshTopic(identity.code, identity.playerId, position)));
  socket.on("topic:submit", identityAction((identity, animeId: string) => store.submitTopic(identity.code, identity.playerId, animeId)));
  socket.on("draw:submit", identityAction((identity, data: { drawing: string; strokes?: string }) => store.submitDrawing(identity.code, identity.playerId, data.drawing, data.strokes)));
  socket.on("draw:strokes:sync", (data: { strokes: string }) => {
    const identity = identities.get(socket.id);
    if (identity) {
      socket.to(identity.code).emit("draw:strokes:synced", {
        playerId: identity.playerId,
        strokes: data.strokes
      });
    }
  });
  socket.on("guess:submit", identityAction((identity, animeId: string) => store.submitGuess(identity.code, identity.playerId, animeId)));
  socket.on("vote:submit", identityAction((identity, chainId: string, choice: "success" | "failure") => store.vote(identity.code, identity.playerId, chainId, choice)));
  socket.on("game:restart", identityAction((identity) => store.returnToLobby(identity.code, identity.playerId)));

  socket.on("player:move", (data: { x: number; y: number; isLeft: boolean; animState: string }) => {
    const identity = identities.get(socket.id);
    if (identity) {
      store.updatePlayerPosition(identity.code, identity.playerId, data.x, data.y, data.isLeft, data.animState);
      socket.to(identity.code).emit("player:moved", {
        playerId: identity.playerId,
        ...data,
      });
    }
  });

  socket.on("player:attack", () => {
    const identity = identities.get(socket.id);
    if (!identity) return;
    const resolution = store.resolveWarriorAttack(identity.code, identity.playerId);
    if (resolution) io.to(identity.code).emit("player:attacked", resolution);
  });

  socket.on("disconnect", () => {
    const identity = identities.get(socket.id);
    if (identity) store.disconnect(identity);
    identities.delete(socket.id);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Draw & Guess server: http://localhost:${PORT}`);
});
