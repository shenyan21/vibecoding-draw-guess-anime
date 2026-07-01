import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GameFrame } from "../components/GameFrame";
import { useRoomStore } from "../store/roomStore";
import { DrawingView } from "./game/DrawingView";
import { GuessingView } from "./game/GuessingView";
import { RevealVoteView } from "./game/RevealVoteView";
import { TopicSelectionView } from "./game/TopicSelectionView";
import { WaitingView } from "./game/WaitingView";

const TITLES = {
  TOPIC: ["OPENING", "选择题目"],
  DRAW: ["DRAW", "绘制动画"],
  GUESS: ["GUESS", "锁定答案"],
  REVEAL: ["REPLAY", "传递揭晓"],
  VOTE: ["JUDGEMENT", "判定结果"],
} as const;

export function GamePage() {
  const view = useRoomStore((state) => state.view);
  const connected = useRoomStore((state) => state.connected);
  const navigate = useNavigate();
  const { code } = useParams();

  useEffect(() => {
    if (!view) return;
    if (view.phase === "LOBBY") navigate(`/room/${view.code}`, { replace: true });
    if (view.phase === "RESULTS") navigate(`/results/${view.code}`, { replace: true });
  }, [navigate, view]);

  if (!view || view.code !== code) return (
    <main className="loading-screen">
      <span style={{ fontSize: "14px", fontWeight: "bold", color: "var(--cyan)", letterSpacing: "0.15em" }}>DG</span>
      <div className="loading-bar">
        <i />
      </div>
      <strong>{connected ? "同步进度中" : "连接服务器中"}</strong>
    </main>
  );
  if (view.phase === "LOBBY" || view.phase === "RESULTS") return null;
  const [eyebrow, title] = TITLES[view.phase];

  const isScrolling = view.phase === "GUESS" && !!view.task;

  return (
    <GameFrame view={view} eyebrow={eyebrow} title={title} scrollingLobby={isScrolling}>
      {view.phase === "REVEAL" || view.phase === "VOTE" ? (
        <RevealVoteView view={view} />
      ) : !view.task ? (
        <WaitingView view={view} />
      ) : view.task.kind === "TOPIC" ? (
        <TopicSelectionView offer={view.task.offer} />
      ) : view.task.kind === "DRAW" ? (
        <DrawingView source={view.task.source} fromPlayerId={view.task.fromPlayerId} players={view.players} selfId={view.selfId} />
      ) : (
        <GuessingView drawing={view.task.drawing} candidates={view.candidates} fromPlayerId={view.task.fromPlayerId} players={view.players} />
      )}
    </GameFrame>
  );
}
