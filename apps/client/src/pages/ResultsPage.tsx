import { Check, RotateCcw, Trophy, X } from "lucide-react";
import React, { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GameFrame } from "../components/GameFrame";
import { roomActions, useRoomStore } from "../store/roomStore";

export function ResultsPage() {
  const view = useRoomStore((state) => state.view);
  const connected = useRoomStore((state) => state.connected);
  const navigate = useNavigate();
  const { code } = useParams();

  useEffect(() => {
    if (!view) return;
    if (view.phase === "LOBBY") navigate(`/room/${view.code}`, { replace: true });
    else if (view.phase !== "RESULTS") navigate(`/game/${view.code}`, { replace: true });
  }, [navigate, view]);

  if (!view || view.code !== code) return (
    <main className="loading-screen">
      <span style={{ fontSize: "14px", fontWeight: "bold", color: "var(--cyan)", letterSpacing: "0.15em" }}>DG</span>
      <div className="loading-bar">
        <i />
      </div>
      <strong>{connected ? "同步结算中" : "连接服务器中"}</strong>
    </main>
  );
  if (view.phase !== "RESULTS") return null;
  const self = view.players.find((player) => player.id === view.selfId)!;
  const successes = view.chains.filter((chain) => chain.outcome === "success").length;

  return (
    <GameFrame view={view} eyebrow="RESULT" title="本局结算" scrollingLobby={true}>
      <section className="results-view">
        <div className="results-hero panel">
          <div className="trophy-mark"><Trophy size={34} /></div>
          <div><span>TRANSMISSION SCORE</span><h1>{successes}<i>/</i>{view.chains.length}</h1></div>
          <div className="results-meter"><i style={{ width: `${(successes / view.chains.length) * 100}%` }} /></div>
          {self.isHost ? (
            <button className="primary-button replay-button" onClick={() => roomActions.restart()}><RotateCcw size={18} /> 返回房间</button>
          ) : (
            <div className="waiting-host"><span className="pulse-ring" /> 等待房主返回</div>
          )}
        </div>
        <div className="results-chains">
          {view.chains.map((chain, index) => {
            const final = chain.contributions.at(-1);
            const successVotes = Object.values(chain.votes).filter((vote) => vote === "success").length;
            return (
              <article className={`result-chain panel ${chain.outcome}`} key={chain.id}>
                <div className="result-chain-head"><span>CHAIN {String(index + 1).padStart(2, "0")}</span><strong>{chain.outcome === "success" ? <><Check size={17} /> SUCCESS</> : <><X size={17} /> FAILED</>}</strong></div>
                <div className="result-flow" style={{ display: "flex", alignItems: "center", gap: "16px", overflowX: "auto", paddingBottom: "12px" }}>
                  <div style={{ minWidth: "140px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "6px" }}>
                    <img src={chain.topic?.image} alt="" style={{ width: "80px", height: "110px", objectFit: "cover", borderRadius: "4px", border: "1px solid var(--line)" }} />
                    <span style={{ color: "var(--muted)", fontSize: "10px", fontWeight: "bold" }}>START</span>
                    <strong style={{ fontSize: "12px", color: "#fff", fontWeight: "700", wordBreak: "break-all" }}>{chain.topic?.name}</strong>
                  </div>
                  {chain.contributions.map((entry, entryIndex) => {
                    const player = view.players.find((p) => p.id === entry.playerId);
                    return (
                      <React.Fragment key={entryIndex}>
                        <i style={{ color: "var(--muted)", fontSize: "18px", fontStyle: "normal" }}>→</i>
                        <div style={{ minWidth: "140px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "6px" }}>
                          {entry.kind === "DRAW" ? (
                            <img src={entry.drawing} alt="画作" style={{ width: "80px", height: "110px", objectFit: "cover", borderRadius: "4px", border: "1px solid var(--line)" }} />
                          ) : (
                            <img src={entry.anime.image} alt="动漫" style={{ width: "80px", height: "110px", objectFit: "cover", borderRadius: "4px", border: "1px solid var(--line)" }} />
                          )}
                          <span style={{ color: "var(--muted)", fontSize: "10px", textTransform: "uppercase" }}>
                            {entry.kind === "DRAW" ? "绘画" : "猜测"}
                          </span>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            background: "rgba(0, 210, 255, 0.08)",
                            border: "1px solid rgba(0, 210, 255, 0.2)",
                            color: "var(--cyan)",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "bold",
                            marginTop: "2px"
                          }}>
                            {player?.name || "未知"}
                          </span>
                          <strong style={{ fontSize: "12px", color: "#fff", fontWeight: "700", wordBreak: "break-all", marginTop: "2px" }}>
                            {entry.kind === "GUESS" ? entry.anime.name : "画作"}
                          </strong>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
                <div className="vote-score"><Check size={14} /> {successVotes}<span /><X size={14} /> {view.players.length - successVotes}</div>
              </article>
            );
          })}
        </div>
      </section>
    </GameFrame>
  );
}
