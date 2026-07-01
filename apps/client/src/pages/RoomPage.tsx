import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GameFrame } from "../components/GameFrame";
import { RoomPlayerDrawerFooter } from "../components/RoomPlayerDrawerFooter";
import { TiledLobbyGame } from "../components/TiledLobbyGame";
import { useRoomStore, roomActions } from "../store/roomStore";

export function RoomPage() {
  const view = useRoomStore((state) => state.view);
  const connected = useRoomStore((state) => state.connected);
  const [playersOpen, setPlayersOpen] = useState(false);
  const navigate = useNavigate();
  const { code } = useParams();

  useEffect(() => {
    if (view && view.phase !== "LOBBY") navigate(`/game/${view.code}`, { replace: true });
  }, [navigate, view]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [code]);

  if (!view || view.code !== code) return <LoadingScreen connected={connected} />;

  const self = view.players.find((player) => player.id === view.selfId);
  const isHost = self?.isHost;
  const isReady = self?.submitted;
  const guestPlayers = view.players.filter((player) => !player.isHost);
  const guestReadyCount = guestPlayers.filter((player) => player.submitted).length;
  const canStart = view.players.length >= 2 && view.players.length <= 10 && view.players.every((player) => player.connected) && guestPlayers.every((player) => player.submitted);

  return (
    <GameFrame
      view={view}
      eyebrow="ROOM"
      title="集结中"
      scrollingLobby={true}
      playerDrawer={{
        mode: "seats",
        footer: <RoomPlayerDrawerFooter view={view} />,
        onOpenChange: setPlayersOpen,
      }}
    >
      <div className="lobby-stage" style={{ position: "relative" }}>
        <TiledLobbyGame view={view} interactionDisabled={playersOpen} />

        <div className="lobby-ready-floating-container" style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 50 }}>
          {isHost ? (
            <button
              type="button"
              className="primary-button"
              disabled={!canStart}
              onClick={() => roomActions.start()}
              style={{
                boxShadow: canStart ? "0 0 24px rgba(91, 226, 255, 0.4)" : "none",
                fontWeight: "bold",
                minWidth: "160px"
              }}
            >
              开始游戏 ({guestReadyCount}/{guestPlayers.length} 准备)
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={() => roomActions.ready()}
              style={{
                background: isReady ? "var(--green)" : "var(--cyan)",
                borderColor: isReady ? "rgba(63, 230, 161, 0.8)" : "rgba(91, 226, 255, 0.8)",
                color: "#07111d",
                boxShadow: isReady ? "0 0 24px rgba(63, 230, 161, 0.3)" : "0 0 24px rgba(91, 226, 255, 0.18)",
                fontWeight: "bold",
                minWidth: "120px"
              }}
            >
              {isReady ? "取消准备" : "准备"}
            </button>
          )}
        </div>
      </div>
    </GameFrame>
  );
}

function LoadingScreen({ connected }: { connected: boolean }) {
  return (
    <main className="loading-screen">
      <span style={{ fontSize: "14px", fontWeight: "bold", color: "var(--cyan)", letterSpacing: "0.15em" }}>DG</span>
      <div className="loading-bar">
        <i />
      </div>
      <strong>{connected ? "同步房间中" : "连接服务器中"}</strong>
    </main>
  );
}
