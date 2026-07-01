import type { Chain, Contribution, PlayerRoomView } from "@drawandguess/game-core";
import { Check, X } from "lucide-react";
import React, { useEffect, useState, useMemo } from "react";
import { roomActions } from "../../store/roomStore";

type Point = { x: number; y: number };
type Stroke = { mode: "draw" | "erase"; color: string; size: number; points: Point[] };

export function DrawingPlayback({
  strokesJson,
  onComplete,
  height: customHeight = "150px"
}: {
  strokesJson?: string;
  onComplete?: () => void;
  height?: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [currentStrokeIndex, setCurrentStrokeIndex] = useState(0);

  const data = useMemo(() => {
    if (!strokesJson) return null;
    try {
      const parsed = JSON.parse(strokesJson);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.strokes)) {
        return parsed as { width: number; height: number; ratio: number; strokes: Stroke[] };
      }
    } catch {
      // Fallback
    }
    return null;
  }, [strokesJson]);

  const strokes = data ? data.strokes : [];
  const width = data ? data.width : 500;
  const height = data ? data.height : 400;

  useEffect(() => {
    if (strokes.length === 0) {
      onComplete?.();
      return;
    }

    setCurrentStrokeIndex(0);
    let index = 0;
    const interval = window.setInterval(() => {
      index++;
      if (index <= strokes.length) {
        setCurrentStrokeIndex(index);
      } else {
        window.clearInterval(interval);
        onComplete?.();
      }
    }, 300); // 每笔 0.3 秒

    return () => window.clearInterval(interval);
  }, [strokes, onComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    // 清空画布
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.lineCap = "round";
    context.lineJoin = "round";

    const visibleStrokes = strokes.slice(0, currentStrokeIndex);
    visibleStrokes.forEach((stroke) => {
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
  }, [strokes, currentStrokeIndex, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        width: "100%",
        height: customHeight,
        background: "#ffffff",
        borderRadius: "5px",
        display: "block",
        objectFit: "contain"
      }}
    />
  );
}

export function RevealVoteView({ view }: { view: PlayerRoomView }) {
  // 寻找到当前尚有玩家未完成判定的传递链索引
  let activeChainIndex = view.chains.findIndex(
    (chain) => Object.keys(chain.votes).length < view.players.length
  );
  if (activeChainIndex === -1) {
    activeChainIndex = 0; // 回退方案
  }

  const activeChain = view.chains[activeChainIndex];
  const items = useMemo(() => {
    const list: any[] = [];
    if (!activeChain) return list;
    if (activeChain.topic) {
      list.push({ kind: "TOPIC", topic: activeChain.topic });
    }
    if (activeChain.contributions) {
      list.push(...activeChain.contributions);
    }
    return list;
  }, [activeChain]);

  const totalItems = view.totalRounds + 1; // 初始题目 + 各个回合提交
  const [revealedCount, setRevealedCount] = useState(1);
  const [playbackComplete, setPlaybackComplete] = useState(false);
  const [showFinishedDrawing, setShowFinishedDrawing] = useState(false);

  useEffect(() => {
    if (!activeChain) return;
    setRevealedCount(1);
    setPlaybackComplete(false);
    setShowFinishedDrawing(false);
  }, [activeChain?.id]);

  useEffect(() => {
    if (!activeChain || revealedCount > totalItems) return;

    const isTopic = revealedCount === 1;
    const latestContribution = !isTopic ? activeChain.contributions[revealedCount - 2] : null;

    let timeoutId: number;

    if (isTopic) {
      // 动画展示只需要显示 1s
      timeoutId = window.setTimeout(() => {
        setRevealedCount((prev) => prev + 1);
      }, 1000);
    } else if (latestContribution?.kind === "DRAW" && latestContribution.strokes) {
      // 画作的展示需要记录每个人是如何画出来的，按照一笔一画逐步播放完
      if (playbackComplete) {
        setShowFinishedDrawing(true);
        timeoutId = window.setTimeout(() => {
          setPlaybackComplete(false);
          setShowFinishedDrawing(false);
          setRevealedCount((prev) => prev + 1);
        }, 1500);
      }
    } else {
      // 动画展示只需要显示 1s (猜测卡片或无笔画的画作)
      timeoutId = window.setTimeout(() => {
        setRevealedCount((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [activeChain, revealedCount, totalItems, playbackComplete]);

  if (!activeChain) return null;

  const progress = Math.min(100, (revealedCount / totalItems) * 100);
  const animationFinished = revealedCount > totalItems;

  const choice = activeChain.votes[view.selfId];
  const successVoters = view.players.filter((p) => activeChain.votes[p.id] === "success");
  const failureVoters = view.players.filter((p) => activeChain.votes[p.id] === "failure");
  const totalVoted = successVoters.length + failureVoters.length;

  const isTopic = revealedCount === 1;
  const currentEntry = !isTopic ? activeChain.contributions[revealedCount - 2] : null;
  const currentPlayer = currentEntry ? view.players.find((p) => p.id === currentEntry.playerId) : null;

  return (
    <section
      className="reveal-view"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: animationFinished ? "auto" : "hidden",
      }}
    >
      <div className="reveal-header">
        <div>
          <span>VOTE / CHAIN {activeChainIndex + 1}</span>
          <h1>传递链 {activeChainIndex + 1}</h1>
        </div>
        <strong>{activeChainIndex + 1} / {view.chains.length}</strong>
      </div>
      <div className="reveal-progress">
        <i style={{ width: `${progress}%` }} />
      </div>

      {/* 动画播放阶段：水平滑动轨迹展示，彻底避免卡片瞬移，实现完美平滑过渡 */}
      {!animationFinished ? (
        <div style={{ flex: 1, position: "relative", width: "100%", overflow: "hidden", display: "flex", alignItems: "center", minHeight: 0 }}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              height: "100%",
              marginLeft: "-240px", // 480px 宽度的一半
              display: "flex",
              alignItems: "center",
              gap: "60px",
              transition: "transform 0.7s cubic-bezier(0.25, 1, 0.5, 1)",
              transform: `translateX(-${(revealedCount - 1) * 540}px)`, // 480px 宽度 + 60px 间距 = 540px
              width: `${items.length * 540}px`
            }}
          >
            {items.map((item, i) => {
              const isActive = i === revealedCount - 1;
              const isHistory = i < revealedCount - 1;
              const isFuture = i > revealedCount - 1;

              const itemStyle: React.CSSProperties = {
                width: "480px",
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                transition: "transform 0.7s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.7s ease",
                transform: isActive ? "scale(1)" : "scale(0.7)",
                opacity: isActive ? 1 : isHistory ? 0.35 : 0,
                pointerEvents: isActive ? "auto" : "none",
                userSelect: isActive ? "auto" : "none"
              };

              return (
                <div key={i} style={itemStyle}>
                  {item.kind === "TOPIC" ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
                      <span style={{ fontSize: "12px", color: "var(--cyan)", fontWeight: "bold", letterSpacing: "0.15em" }}>
                        START · 初始动漫题目
                      </span>
                      <img
                        src={item.topic?.image}
                        alt=""
                        style={{
                          width: "260px",
                          height: "360px",
                          objectFit: "cover",
                          borderRadius: "10px",
                          border: "2px solid var(--line)",
                          boxShadow: "0 15px 30px rgba(0,0,0,0.5)"
                        }}
                      />
                      <h2 style={{ fontSize: "24px", fontWeight: "800", color: "#fff", margin: 0, textAlign: "center" }}>
                        {item.topic?.name}
                      </h2>
                    </div>
                  ) : item.kind === "DRAW" ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
                      <span style={{ fontSize: "12px", color: "var(--cyan)", fontWeight: "bold", letterSpacing: "0.15em" }}>
                        第 {i} 步 · 绘画人：{view.players.find((p) => p.id === item.playerId)?.name}
                      </span>
                      <div style={{
                        width: "480px",
                        height: "480px",
                        background: "#ffffff",
                        borderRadius: "10px",
                        border: "2px solid var(--line)",
                        boxShadow: "0 15px 30px rgba(0,0,0,0.5)",
                        overflow: "hidden",
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "16px"
                      }}>
                        {isActive && item.strokes && !showFinishedDrawing ? (
                          <DrawingPlayback
                            strokesJson={item.strokes}
                            height="440px"
                            onComplete={() => setPlaybackComplete(true)}
                          />
                        ) : (
                          <img
                            src={item.drawing}
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain"
                            }}
                          />
                        )}
                      </div>
                      <h2 style={{ fontSize: "18px", fontWeight: "700", color: "var(--muted)", margin: 0 }}>
                        {isActive ? (showFinishedDrawing ? "绘图完成！" : "画作细节逐步重现中...") : "画作已完成"}
                      </h2>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
                      <span style={{ fontSize: "12px", color: "var(--cyan)", fontWeight: "bold", letterSpacing: "0.15em" }}>
                        第 {i} 步 · 猜测人：{view.players.find((p) => p.id === item.playerId)?.name}
                      </span>
                      <img
                        src={item.anime?.image}
                        alt=""
                        style={{
                          width: "260px",
                          height: "360px",
                          objectFit: "cover",
                          borderRadius: "10px",
                          border: "2px solid var(--line)",
                          boxShadow: "0 15px 30px rgba(0,0,0,0.5)"
                        }}
                      />
                      <h2 style={{ fontSize: "24px", fontWeight: "800", color: "#fff", margin: 0, textAlign: "center" }}>
                        猜测为：{item.anime?.name}
                      </h2>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* 播放完毕阶段：平铺展示整条传递链，并唤起投票 */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0, padding: "20px 0" }}>
          <div className="result-flow" style={{ display: "flex", alignItems: "center", gap: "16px", overflowX: "auto", paddingBottom: "20px", width: "100%", maxWidth: "900px", margin: "0 auto" }}>
            <div style={{ minWidth: "140px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "6px" }}>
              <img src={activeChain.topic?.image} alt="" style={{ width: "80px", height: "110px", objectFit: "cover", borderRadius: "4px", border: "1px solid var(--line)" }} />
              <span style={{ color: "var(--muted)", fontSize: "10px", fontWeight: "bold" }}>START</span>
              <strong style={{ fontSize: "12px", color: "#fff", fontWeight: "700", wordBreak: "break-all" }}>{activeChain.topic?.name}</strong>
            </div>
            {activeChain.contributions.map((entry, entryIndex) => {
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

          <div className="vote-card panel" style={{ width: "100%", maxWidth: "600px", margin: "20px auto 0", padding: "20px", borderRadius: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "bold" }}>
                对该传递链判定 (已投 {totalVoted}/{view.players.length} 人)
              </span>
              {choice && (
                <span style={{ fontSize: "11px", color: choice === "success" ? "var(--green)" : "var(--red)", fontWeight: "bold" }}>
                  您的选择：{choice === "success" ? "正确" : "错误"}
                </span>
              )}
            </div>
            
            <div className="vote-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <button
                className={choice === "success" ? "selected success" : ""}
                disabled={Boolean(choice)}
                onClick={() => roomActions.vote(activeChain.id, "success")}
                style={{
                  background: choice === "success" ? "var(--green)" : "rgba(255, 255, 255, 0.025)",
                  borderColor: choice === "success" ? "var(--green)" : "var(--line)",
                  color: choice === "success" ? "#07111d" : "#718098"
                }}
              >
                <Check size={20} />
              </button>
              <button
                className={choice === "failure" ? "selected failure" : ""}
                disabled={Boolean(choice)}
                onClick={() => roomActions.vote(activeChain.id, "failure")}
                style={{
                  background: choice === "failure" ? "var(--red)" : "rgba(255, 255, 255, 0.025)",
                  borderColor: choice === "failure" ? "var(--red)" : "var(--line)",
                  color: choice === "failure" ? "#07111d" : "#718098"
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="vote-voters">
              <div className="voters-group success">
                <Check size={14} />
                <div className="voters-list">
                  {successVoters.length > 0 ? (
                    successVoters.map((v) => <span key={v.id} className="voter-tag">{v.name}</span>)
                  ) : (
                    <span className="voters-empty">暂无</span>
                  )}
                </div>
              </div>
              <div className="voters-group failure">
                <X size={14} />
                <div className="voters-list">
                  {failureVoters.length > 0 ? (
                    failureVoters.map((v) => <span key={v.id} className="voter-tag">{v.name}</span>)
                  ) : (
                    <span className="voters-empty">暂无</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
