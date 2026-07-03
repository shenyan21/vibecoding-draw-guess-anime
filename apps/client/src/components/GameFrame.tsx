import type { PlayerRoomView } from "@drawandguess/game-core";
import { ChevronDown, Copy, UsersRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { PlayerDrawer } from "./PlayerDrawer";

type PlayerDrawerConfig = {
  mode?: "players" | "seats";
  footer?: ReactNode;
  onOpenChange?: (open: boolean) => void;
};

function CountdownBar({ roundEndsAt, duration }: { roundEndsAt: number; duration: number }) {
  const [percent, setPercent] = useState(100);

  useEffect(() => {
    const update = () => {
      const remainingMs = Math.max(0, roundEndsAt - Date.now());
      const totalMs = duration * 1000;
      setPercent(Math.min(100, Math.max(0, (remainingMs / totalMs) * 100)));
    };
    update();
    const interval = window.setInterval(update, 100);
    return () => window.clearInterval(interval);
  }, [roundEndsAt, duration]);

  return (
    <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.05)", position: "relative", overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          background: "var(--cyan)",
          boxShadow: "0 0 8px var(--cyan)",
          width: `${percent}%`,
          transition: "width 0.1s linear"
        }}
      />
    </div>
  );
}

function CountdownText({ roundEndsAt }: { roundEndsAt: number }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const update = () => {
      setSeconds(Math.max(0, Math.round((roundEndsAt - Date.now()) / 1000)));
    };
    update();
    const interval = window.setInterval(update, 200);
    return () => window.clearInterval(interval);
  }, [roundEndsAt]);

  const format = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return <span>{format(seconds)}</span>;
}

export function GameFrame({
  view,
  eyebrow,
  title,
  children,
  playerDrawer,
  scrollingLobby = false,
}: {
  view: PlayerRoomView;
  eyebrow: string;
  title: string;
  children: ReactNode;
  playerDrawer?: PlayerDrawerConfig;
  scrollingLobby?: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  const setOpen = useCallback((open: boolean) => {
    setDrawerOpen(open);
    playerDrawer?.onOpenChange?.(open);
    if (open) {
      window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    } else {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [playerDrawer]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, setOpen]);

  useEffect(() => {
    if (drawerOpen) setOpen(false);
    // Only close when the room or phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.code, view.phase]);

  const copyRoomCode = () => navigator.clipboard?.writeText(view.code);

  const showCountdown = view.roundEndsAt && (view.phase === "DRAW" || view.phase === "GUESS" || view.phase === "VOTE");

  return (
    <main className={`game-frame ${view.phase === "LOBBY" ? "game-frame--lobby" : ""} ${scrollingLobby ? "game-frame--scrolling-lobby" : ""}`}>
      <header className="topbar">
        <div className="brand-mark">
          <span className="brand-glyph">D/G</span>
          <span>ANIME RELAY</span>
        </div>
        <div className="round-status">
          <span className="visually-hidden">{eyebrow}</span>
          <strong>{title}</strong>
        </div>
        <div className="topbar-actions">
          {showCountdown && (
            <div className="room-chip countdown-chip" style={{ borderColor: "rgba(0, 210, 255, 0.3)", color: "var(--cyan)", fontWeight: "bold" }}>
              <span>⏱️</span>
              <CountdownText roundEndsAt={view.roundEndsAt!} />
            </div>
          )}
          <button type="button" className="room-chip" onClick={copyRoomCode} title="复制房间码">
            <span className="status-dot" />
            {view.code}
            <Copy size={13} />
          </button>
          <button
            ref={triggerRef}
            type="button"
            className={`player-drawer-trigger ${drawerOpen ? "is-open" : ""}`}
            aria-expanded={drawerOpen}
            aria-controls="player-drawer"
            aria-label={`查看玩家，当前 ${view.players.length} 人，共 ${view.capacity} 个席位`}
            onClick={() => setOpen(!drawerOpen)}
          >
            <UsersRound size={17} />
            <span>玩家</span>
            <strong>{view.players.length}/{view.capacity}</strong>
            <ChevronDown size={15} />
          </button>
        </div>
      </header>

      {showCountdown && (
        <CountdownBar
          roundEndsAt={view.roundEndsAt!}
          duration={view.phase === "DRAW" ? view.drawDuration : view.phase === "GUESS" ? view.guessDuration : 30}
        />
      )}

      <PlayerDrawer
        view={view}
        open={drawerOpen}
        mode={playerDrawer?.mode ?? "players"}
        footer={playerDrawer?.footer}
        closeButtonRef={closeButtonRef}
        onClose={() => setOpen(false)}
      />

      <div className="game-layout">
        <section className="game-content">{children}</section>
      </div>
    </main>
  );
}
