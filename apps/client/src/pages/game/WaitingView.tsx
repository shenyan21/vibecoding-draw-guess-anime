import type { PlayerRoomView } from "@drawandguess/game-core";
import { Check, Paintbrush, Radio } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { socket } from "../../store/roomStore";

type Point = { x: number; y: number };
type Stroke = { mode: "draw" | "erase"; color: string; size: number; points: Point[] };

function StaticDrawingViewer({
  strokesJson,
  width = 500,
  height = 400,
}: {
  strokesJson?: string;
  width?: number;
  height?: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const data = useMemo(() => {
    if (!strokesJson) return null;
    try {
      const parsed = JSON.parse(strokesJson);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.strokes)) {
        return parsed as { width: number; height: number; ratio: number; strokes: Stroke[] };
      }
    } catch {
      // ignore
    }
    return null;
  }, [strokesJson]);

  const strokes = data ? data.strokes : [];
  const canvasWidth = data ? data.width : width;
  const canvasHeight = data ? data.height : height;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    // 清空背景为纯白
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.lineCap = "round";
    context.lineJoin = "round";

    strokes.forEach((stroke) => {
      if (stroke.points.length === 0) return;
      context.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
      context.strokeStyle = stroke.color;
      context.fillStyle = stroke.color;
      context.lineWidth = stroke.size;
      context.beginPath();
      context.moveTo(stroke.points[0].x, stroke.points[0].y);
      if (stroke.points.length === 1) {
        context.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        for (const point of stroke.points.slice(1)) {
          context.lineTo(point.x, point.y);
        }
        context.stroke();
      }
    });
    context.globalCompositeOperation = "source-over";
  }, [strokes, canvasWidth, canvasHeight]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        background: "#ffffff",
        borderRadius: "8px",
        display: "block",
        objectFit: "contain",
        boxShadow: "0 10px 25px rgba(0,0,0,0.5)"
      }}
    />
  );
}
export function WaitingView({ view }: { view: PlayerRoomView }) {
  const done = view.players.filter((player) => player.submitted).length;
  const sortedPlayers = [...view.players].sort((a, b) => a.seat - b.seat);
  const otherPlayers = view.players.filter((p) => p.id !== view.selfId);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [strokesMap, setStrokesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const handleStrokesSynced = (data: { playerId: string; strokes: string }) => {
      setStrokesMap((prev) => ({
        ...prev,
        [data.playerId]: data.strokes,
      }));
    };
    socket.on("draw:strokes:synced", handleStrokesSynced);
    return () => {
      socket.off("draw:strokes:synced", handleStrokesSynced);
    };
  }, []);

  // 当回合或者阶段变化时，清空选中玩家的高亮状态以防继承到下一关
  useEffect(() => {
    setSelectedPlayerId(null);
  }, [view.roundIndex, view.phase]);

  // 默认选中第一个未提交的其他玩家，或者第一个其他玩家
  useEffect(() => {
    if (view.phase === "DRAW" && !selectedPlayerId && otherPlayers.length > 0) {
      const activePlayer = otherPlayers.find((p) => !p.submitted) || otherPlayers[0];
      setSelectedPlayerId(activePlayer.id);
    }
  }, [view.phase, otherPlayers, selectedPlayerId]);

  const selectedPlayer = otherPlayers.find((p) => p.id === selectedPlayerId);

  return (
    <section className="waiting-view panel" style={{ display: "grid", gridTemplateColumns: "380px 1fr", height: "640px", padding: 0, overflow: "hidden", background: "#0c111e", zIndex: 1, justifyItems: "stretch", alignItems: "stretch" }}>
      {/* 左侧：所有玩家的状态列表 */}
      <div style={{ width: "380px", minWidth: "380px", flexShrink: 0, borderRight: "1px solid var(--line)", background: "#0e1524", display: "flex", flexDirection: "column", minHeight: 0, zIndex: 2, position: "relative" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "11px", fontWeight: "bold", color: "var(--cyan)", letterSpacing: "0.1em" }}>玩家提交状态</span>
          <span style={{ fontSize: "10px", color: "var(--muted)" }}>{done}/{view.players.length}</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", padding: "12px", gap: "8px", scrollbarWidth: "thin" }}>
          {sortedPlayers.map((player) => {
            const isSelf = player.id === view.selfId;
            const isSelected = view.phase === "DRAW" && player.id === selectedPlayerId;
            const isClickable = view.phase === "DRAW" && !isSelf;

            const handleItemClick = () => {
              if (isClickable) {
                setSelectedPlayerId(player.id);
              }
            };

            return (
              <div
                key={player.id}
                onClick={handleItemClick}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  background: isSelected ? "rgba(0, 210, 255, 0.12)" : isSelf ? "rgba(255,255,255,0.02)" : "transparent",
                  border: isSelected ? "1px solid var(--cyan)" : isSelf ? "1px dashed rgba(255,255,255,0.1)" : "1px solid transparent",
                  color: isSelected ? "var(--cyan)" : "var(--text)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: isClickable ? "pointer" : "default",
                  transition: "all 0.2s ease"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                  {/* 玩家席位角色颜色圆圈 */}
                  <span style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: player.connected ? "var(--green)" : "#475569",
                    boxShadow: player.connected ? "0 0 8px var(--green)" : "none"
                  }} />
                  <strong style={{ fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isSelf ? "800" : "600" }}>
                    {player.name} {isSelf && <span style={{ fontSize: "10px", color: "var(--muted)", fontWeight: "normal" }}>(你)</span>}
                  </strong>
                </div>
                <span style={{
                  fontSize: "10px",
                  fontWeight: "bold",
                  color: player.submitted ? "var(--green)" : "var(--amber)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  {player.submitted ? (
                    <Check size={16} />
                  ) : (
                    <span className="pulse-ring" style={{ width: "8px", height: "8px", background: "var(--amber)", boxShadow: "0 0 6px var(--amber)" }} />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 右侧内容区 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px", position: "relative", zIndex: 2 }}>
        {view.phase === "DRAW" ? (
          // 绘画阶段的画板查看器
          selectedPlayer ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
              <span style={{ fontSize: "12px", color: "var(--muted)", fontWeight: "bold", letterSpacing: "0.05em" }}>
                正在监视玩家画板：<strong style={{ color: "var(--cyan)", fontSize: "14px" }}>{selectedPlayer.name}</strong>
              </span>
              {strokesMap[selectedPlayer.id] ? (
                <StaticDrawingViewer strokesJson={strokesMap[selectedPlayer.id]} width={640} height={480} />
              ) : (
                <div style={{
                  width: "640px",
                  height: "480px",
                  background: "#ffffff",
                  borderRadius: "8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b",
                  gap: "16px",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.6)"
                }}>
                  <Paintbrush size={38} style={{ color: "#cbd5e1" }} />
                  <span style={{ fontSize: "13px", fontWeight: "500" }}>
                    {selectedPlayer.submitted ? "该玩家已提交，但无绘画轨迹数据" : "该玩家尚未落笔..."}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <span style={{ color: "var(--muted)", fontSize: "13px" }}>选择左侧的一位玩家开始监视画布</span>
          )
        ) : (
          // 猜测阶段/其他阶段的中央 Radar 页面
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative" }}>
            {/* 居中背景装饰圆圈 */}
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "440px",
              height: "440px",
              border: "1px solid rgba(91,226,255,0.12)",
              borderRadius: "50%",
              boxShadow: "0 0 90px rgba(91,226,255,0.06)",
              pointerEvents: "none",
              zIndex: -1
            }} />
            <div className="waiting-signal" style={{ marginBottom: "32px" }}>
              <Radio size={42} />
              <i />
              <i />
              <i />
            </div>
            <div className="waiting-check" style={{ width: "54px", height: "54px" }}>
              <Check size={28} />
            </div>
            <h1 style={{ fontSize: "32px", margin: "20px 0 24px", color: "#fff", fontWeight: "800", letterSpacing: "0.05em" }}>已提交</h1>
            <div className="waiting-count" style={{ scale: "1.1" }}>
              <strong style={{ fontSize: "64px" }}>{done}</strong>
              <span style={{ fontSize: "28px" }}>/</span>
              <em style={{ fontSize: "26px" }}>{view.players.length}</em>
            </div>
            <span className="mono-label" style={{ marginTop: "24px" }}>
              SYNCING ROUND {Math.max(1, view.roundIndex + 1).toString().padStart(2, "0")}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
