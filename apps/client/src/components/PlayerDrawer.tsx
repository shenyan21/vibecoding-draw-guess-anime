import type { PlayerRoomView } from "@drawandguess/game-core";
import { Crown, X, Trash2, GripVertical, Settings, Shuffle } from "lucide-react";
import { useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { roomActions } from "../store/roomStore";

export function PlayerDrawer({
  view,
  open,
  mode,
  footer,
  closeButtonRef,
  onClose,
}: {
  view: PlayerRoomView;
  open: boolean;
  mode: "players" | "seats";
  footer?: ReactNode;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const [draggedSeat, setDraggedSeat] = useState<number | null>(null);

  if (!open) return null;

  const selfPlayer = view.players.find((p) => p.id === view.selfId);
  const isSelfHost = selfPlayer?.isHost;
  const playerBySeat = new Map(view.players.map((player) => [player.seat, player]));
  const rows = mode === "seats"
    ? Array.from({ length: view.capacity }, (_, seat) => playerBySeat.get(seat) ?? null)
    : view.players;

  return (
    <>
      <div className="player-drawer-scrim" aria-hidden="true" onMouseDown={onClose} />
      <aside className="player-drawer" id="player-drawer" aria-labelledby="player-drawer-title">
        <header className="player-drawer-header">
          <div>
            <strong>玩家 {view.players.length}/{view.capacity}</strong>
          </div>
          <button ref={closeButtonRef} type="button" className="player-drawer-close" onClick={onClose} aria-label="关闭玩家列表">
            <X size={18} />
          </button>
        </header>

        <div className="player-drawer-body">
          {/* 房间设置面板 (集成于右上角侧边抽屉内) */}
          {view.phase === "LOBBY" && (
            <div className="drawer-settings-section" style={{
              padding: "16px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid var(--line)",
              borderRadius: "8px",
              marginBottom: "16px",
              textAlign: "left"
            }}>
              <h3 style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Settings size={14} style={{ color: "var(--cyan)" }} />
                  设置
                </span>
                {isSelfHost && (
                  <button
                    type="button"
                    onClick={() => roomActions.shuffleSeats()}
                    style={{
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid var(--line)",
                      borderRadius: "4px",
                      color: "var(--cyan)",
                      padding: "4px 8px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                    title="随机位置"
                  >
                    <Shuffle size={13} />
                  </button>
                )}
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "10px", color: "var(--muted)", fontWeight: "bold", marginBottom: "4px" }}>
                    🎨 绘画 (秒)
                  </label>
                  {isSelfHost ? (
                    <input
                      type="number"
                      min="10"
                      max="600"
                      value={view.drawDuration || 180}
                      onChange={(e) => roomActions.setSettings(Number(e.target.value), view.guessDuration || 60)}
                      style={{
                        width: "100%",
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid var(--line)",
                        borderRadius: "4px",
                        padding: "6px 8px",
                        color: "var(--cyan)",
                        fontSize: "14px",
                        fontWeight: "bold",
                        outline: "none"
                      }}
                    />
                  ) : (
                    <strong style={{ fontSize: "14px", color: "#fff" }}>{view.drawDuration || 180}s</strong>
                  )}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "10px", color: "var(--muted)", fontWeight: "bold", marginBottom: "4px" }}>
                    ⏱️ 猜测 (秒)
                  </label>
                  {isSelfHost ? (
                    <input
                      type="number"
                      min="5"
                      max="300"
                      value={view.guessDuration || 60}
                      onChange={(e) => roomActions.setSettings(view.drawDuration || 180, Number(e.target.value))}
                      style={{
                        width: "100%",
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid var(--line)",
                        borderRadius: "4px",
                        padding: "6px 8px",
                        color: "var(--cyan)",
                        fontSize: "14px",
                        fontWeight: "bold",
                        outline: "none"
                      }}
                    />
                  ) : (
                    <strong style={{ fontSize: "14px", color: "#fff" }}>{view.guessDuration || 60}s</strong>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="player-drawer-list">
            {rows.map((player, index) => {
              const canModify = view.phase === "LOBBY";

              if (!player) {
                return (
                  <div
                    className="player-drawer-row player-drawer-row--empty"
                    key={`empty-${index}`}
                    style={{
                      gridTemplateColumns: canModify && isSelfHost ? "14px 24px minmax(0, 1fr)" : "24px minmax(0, 1fr)",
                      background: "rgba(255, 255, 255, 0.01)",
                      border: "1px dashed var(--line)",
                      borderRadius: "8px",
                      padding: "12px 14px",
                      marginBottom: "8px",
                      display: "grid",
                      alignItems: "center",
                      gap: "10px"
                    }}
                    onDragOver={isSelfHost && canModify ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (draggedSeat !== null && draggedSeat !== index) {
                        roomActions.swapSeats(draggedSeat, index);
                        setDraggedSeat(index);
                      }
                    } : undefined}
                  >
                    {canModify && isSelfHost && <span style={{ width: "14px" }} />}
                    <span className="player-seat-number" style={{ font: "700 11px 'Space Grotesk'", color: "var(--muted)" }}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="player-drawer-name"><strong style={{ fontSize: "14px", color: "var(--muted)" }}>—</strong></div>
                  </div>
                );
              }

              const isSelf = player.id === view.selfId;
              const isDraggingThis = player.seat === draggedSeat;

              return (
                <div
                  className={`player-drawer-row ${isSelf ? "player-drawer-row--self" : ""}`}
                  key={player.id}
                  style={{
                    gridTemplateColumns: canModify && isSelfHost ? "14px 24px minmax(0, 1fr) 18px 24px" : "24px minmax(0, 1fr) 18px",
                    background: isDraggingThis ? "rgba(0, 210, 255, 0.05)" : "rgba(255, 255, 255, 0.02)",
                    border: isDraggingThis ? "1px dashed var(--cyan)" : "1px solid var(--line)",
                    opacity: isDraggingThis ? 0.3 : 1,
                    borderRadius: "8px",
                    padding: "12px 14px",
                    marginBottom: "8px",
                    display: "grid",
                    alignItems: "center",
                    gap: "10px",
                    cursor: canModify && isSelfHost ? "grab" : "default",
                    transition: "all 0.15s ease"
                  }}
                  draggable={canModify && isSelfHost}
                  onDragStart={canModify && isSelfHost ? (e) => {
                    e.dataTransfer.setData("text/plain", String(player.seat));
                    e.dataTransfer.effectAllowed = "move";
                    // 延迟设置状态，以便浏览器捕获完整的原始卡片作为拖拽虚影
                    setTimeout(() => setDraggedSeat(player.seat), 0);
                  } : undefined}
                  onDragEnd={canModify && isSelfHost ? () => {
                    setDraggedSeat(null);
                  } : undefined}
                  onDragOver={canModify && isSelfHost ? (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (draggedSeat !== null && draggedSeat !== player.seat) {
                      roomActions.swapSeats(draggedSeat, player.seat);
                      setDraggedSeat(player.seat);
                    }
                  } : undefined}
                >
                  {canModify && isSelfHost && (
                    <GripVertical size={13} style={{ color: "var(--muted)", cursor: "grab" }} />
                  )}
                  <span className="player-seat-number" style={{ font: "700 11px 'Space Grotesk'", color: "var(--cyan)" }}>
                    {String(player.seat + 1).padStart(2, "0")}
                  </span>
                  <div className="player-drawer-name" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <strong style={{ fontSize: "14px", color: isSelf ? "var(--cyan)" : "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</strong>
                  </div>
                  {player.isHost ? <Crown size={15} className="player-host-icon" aria-label="房主" /> : <span className={`player-ready-dot ${player.submitted ? "is-ready" : ""}`} />}
                  
                  {canModify && isSelfHost && !isSelf && (
                    <button
                      type="button"
                      className="player-kick-btn"
                      onClick={() => roomActions.kickPlayer(player.id)}
                      title="踢出玩家"
                      style={{
                        background: "transparent",
                        border: 0,
                        color: "var(--red)",
                        cursor: "pointer",
                        padding: "2px",
                        display: "grid",
                        placeItems: "center"
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {view.phase !== "LOBBY" ? (
            <div className="player-drawer-round">
              <div><span>ROUND</span><strong>{Math.max(1, view.roundIndex + 1).toString().padStart(2, "0")}</strong></div>
              <div className="player-drawer-meter"><i style={{ width: `${Math.max(0, ((view.roundIndex + 1) / view.totalRounds) * 100)}%` }} /></div>
            </div>
          ) : null}
        </div>

        {footer ? <footer className="player-drawer-footer">{footer}</footer> : null}
      </aside>
    </>
  );
}
