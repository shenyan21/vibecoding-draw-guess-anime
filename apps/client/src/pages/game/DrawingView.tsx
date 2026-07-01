import type { Anime, Player } from "@drawandguess/game-core";
import { AnimeBrief } from "../../components/AnimeBrief";
import { DrawingBoard } from "../../components/DrawingBoard";
import { roomActions } from "../../store/roomStore";


export function DrawingView({
  source,
  fromPlayerId,
  players,
  selfId,
}: {
  source: Anime;
  fromPlayerId?: string;
  players?: Player[];
  selfId: string;
}) {
  const fromPlayer = fromPlayerId && players ? players.find((p) => p.id === fromPlayerId) : null;
  const label = fromPlayer ? `来自 ${fromPlayer.name} 的猜测` : "初始选题";

  const selfIndex = players ? players.findIndex((p) => p.id === selfId) : -1;
  const nextPlayer = players && selfIndex !== -1 ? players[(selfIndex + 1) % players.length] : null;

  return (
    <div className="draw-view">
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {nextPlayer && (
          <div style={{
            background: "rgba(0, 210, 255, 0.05)",
            border: "1px solid rgba(0, 210, 255, 0.2)",
            borderRadius: "6px",
            padding: "8px 12px",
            color: "var(--cyan)",
            fontSize: "12px",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}>
            <span>👉 本轮画作将传递给：<strong>{nextPlayer.name}</strong></span>
          </div>
        )}
        <AnimeBrief anime={source} label={label} />
      </div>
      <DrawingBoard onSubmit={roomActions.submitDrawing} />
    </div>
  );
}
