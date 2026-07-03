import type { Anime, Player } from "@drawandguess/game-core";
import { Check, Filter, Search, Star, Users, X } from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";
import { AnimeCard } from "../../components/AnimeCard";
import { roomActions, useRoomStore } from "../../store/roomStore";

function searchable(anime: Anime): string {
  return [anime.name, ...anime.aliases, ...anime.tags, ...anime.characters].join(" ").toLowerCase();
}

export function GuessingView({
  drawing,
  candidates,
  fromPlayerId,
  players,
}: {
  drawing: string;
  candidates: Anime[];
  fromPlayerId?: string;
  players?: Player[];
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [showTags, setShowTags] = useState(false);
  const [busy, setBusy] = useState(false);
  const selected = candidates.find((anime) => anime.id === selectedId) ?? null;
  const popularTags = useMemo(() => {
    const counts = new Map<string, number>();
    candidates.forEach((anime) => anime.tags.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [candidates]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return candidates.filter((anime) => (!normalized || searchable(anime).includes(normalized)) && (!tag || anime.tags.includes(tag)));
  }, [candidates, query, tag]);

  const submit = async () => {
    if (!selectedId) return;
    setBusy(true);
    try { await roomActions.submitGuess(selectedId); } finally { setBusy(false); }
  };

  const fromPlayer = fromPlayerId && players ? players.find((p) => p.id === fromPlayerId) : null;

  const roundEndsAt = useRoomStore((state) => state.view?.roundEndsAt);
  const phase = useRoomStore((state) => state.view?.phase);

  const latestSubmit = useRef(submit);
  const latestSelectedId = useRef(selectedId);
  const latestCandidates = useRef(candidates);

  useEffect(() => {
    latestSubmit.current = submit;
    latestSelectedId.current = selectedId;
    latestCandidates.current = candidates;
  });

  useEffect(() => {
    if (!roundEndsAt || phase !== "GUESS") return;
    const checkTime = () => {
      const remaining = roundEndsAt - Date.now();
      if (remaining <= 0) {
        clearInterval(timerId);
        if (latestSelectedId.current) {
          latestSubmit.current();
        } else if (latestCandidates.current.length > 0) {
          const fallbackId = latestCandidates.current[0].id;
          setSelectedId(fallbackId);
          setBusy(true);
          roomActions.submitGuess(fallbackId).finally(() => setBusy(false));
        }
      }
    };
    const timerId = setInterval(checkTime, 200);
    return () => clearInterval(timerId);
  }, [roundEndsAt, phase]);

  return (
    <div className="guess-view">
      <section className="drawing-preview panel">
        {fromPlayer && (
          <div className="drawing-author-header" style={{
            padding: "12px 16px",
            background: "rgba(5, 10, 20, 0.5)",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <span className="status-dot" style={{ background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan)" }} />
            <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: "700", letterSpacing: "0.1em" }}>作者 / AUTHOR:</span>
            <strong style={{ fontSize: "16px", color: "var(--cyan)", fontWeight: "800" }}>{fromPlayer.name}</strong>
          </div>
        )}
        <div className="preview-canvas"><img src={drawing} alt="上一名玩家的画" /></div>
      </section>
      <section className="candidate-panel panel">
        <div className="candidate-tools">
          <label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索动画、角色、标签" /></label>
          <div className="tag-filter-wrap">
            <button className={`filter-button ${tag ? "active" : ""}`} onClick={() => setShowTags((value) => !value)}><Filter size={17} /> {tag || "标签"}</button>
            {showTags && (
              <div className="tag-popover">
                <button className={!tag ? "active" : ""} onClick={() => { setTag(null); setShowTags(false); }}>全部</button>
                {popularTags.map(([item, count]) => <button className={tag === item ? "active" : ""} key={item} onClick={() => { setTag(item); setShowTags(false); }}>{item}<span>{count}</span></button>)}
              </div>
            )}
          </div>
          <span className="result-count">{filtered.length.toString().padStart(3, "0")}</span>
        </div>
        <div className="candidate-grid" style={{ position: "relative" }}>
          {filtered.map((anime, index) => {
            const isSelected = anime.id === selectedId;
            const isDownwards = index < 12;
            const colIndex = index % 6;

            return (
              <div key={anime.id} style={{ position: "relative" }}>
                <AnimeCard anime={anime} compact selected={isSelected} onClick={() => setSelectedId(anime.id)} />
                {isSelected && (
                  <div className="anime-detail-bubble" style={{
                    position: "absolute",
                    top: isDownwards ? "calc(100% + 12px)" : "auto",
                    bottom: isDownwards ? "auto" : "calc(100% + 12px)",
                    left: colIndex === 0 ? "0px" : colIndex === 5 ? "auto" : "50%",
                    right: colIndex === 5 ? "0px" : "auto",
                    transform: colIndex === 0 || colIndex === 5 ? "none" : "translateX(-50%)",
                    width: "280px",
                    background: "#0b1329",
                    border: "1px solid var(--cyan)",
                    borderRadius: "8px",
                    padding: "12px",
                    boxShadow: "0 12px 36px rgba(0,0,0,0.8), 0 0 12px rgba(0,210,255,0.2)",
                    zIndex: 200,
                    cursor: "default"
                  }} onClick={(e) => e.stopPropagation()}>
                    {/* Bubble Arrow */}
                    <div style={{
                      position: "absolute",
                      top: isDownwards ? "auto" : "100%",
                      bottom: isDownwards ? "100%" : "auto",
                      left: colIndex === 0 ? "24px" : colIndex === 5 ? "auto" : "50%",
                      right: colIndex === 5 ? "auto" : "24px",
                      transform: colIndex === 0 || colIndex === 5 ? "none" : "translateX(-50%)",
                      width: 0,
                      height: 0,
                      borderLeft: "8px solid transparent",
                      borderRight: "8px solid transparent",
                      borderTop: isDownwards ? "none" : "8px solid #0b1329",
                      borderBottom: isDownwards ? "8px solid #0b1329" : "none"
                    }} />
                    <div style={{
                      position: "absolute",
                      top: isDownwards ? "auto" : "100%",
                      bottom: isDownwards ? "100%" : "auto",
                      left: colIndex === 0 ? "24px" : colIndex === 5 ? "auto" : "50%",
                      right: colIndex === 5 ? "24px" : "auto",
                      transform: colIndex === 0 || colIndex === 5
                        ? (isDownwards ? "translateY(-1px)" : "translateY(1px)")
                        : (isDownwards ? "translateX(-50%) translateY(-1px)" : "translateX(-50%) translateY(1px)"),
                      width: 0,
                      height: 0,
                      borderLeft: "8px solid transparent",
                      borderRight: "8px solid transparent",
                      borderTop: isDownwards ? "none" : "8px solid var(--cyan)",
                      borderBottom: isDownwards ? "8px solid var(--cyan)" : "none",
                      zIndex: -1
                    }} />
                    
                    {/* Content */}
                    <div style={{ display: "flex", gap: "10px", alignItems: "start", textAlign: "left" }}>
                      <img src={anime.image} alt="" style={{ width: "60px", height: "85px", objectFit: "cover", borderRadius: "4px" }} />
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "8px", color: "var(--cyan)", fontWeight: "bold" }}>RANK #{anime.rank}</span>
                          <span style={{ fontSize: "8px", color: "var(--muted)" }}>📅 {anime.date.slice(0, 4) || "—"}</span>
                        </div>
                        <strong style={{ fontSize: "12px", color: "#fff", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={anime.name}>{anime.name}</strong>
                        {anime.aliases && anime.aliases.length > 0 && (
                          <span style={{ fontSize: "8px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", marginTop: "-2px" }}>
                            {anime.aliases.join(" / ")}
                          </span>
                        )}
                        <div style={{ display: "flex", gap: "8px", color: "var(--muted)", fontSize: "10px", marginTop: "2px" }}>
                          <span>⭐ {anime.score.toFixed(1)}</span>
                          <span>👥 {anime.votes.toLocaleString()} 评分</span>
                        </div>
                      </div>
                    </div>
                    {anime.tags && anime.tags.length > 0 && (
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "6px", borderTop: "1px solid var(--line)", paddingTop: "6px" }}>
                        {anime.tags.map((t) => (
                          <em key={t} style={{ fontStyle: "normal", fontSize: "8px", padding: "1px 4px", border: "1px solid var(--line)", borderRadius: "2px", color: "#cbd5e1" }}>{t}</em>
                        ))}
                      </div>
                    )}
                    {anime.characters && anime.characters.length > 0 && (
                      <div style={{ textAlign: "left", fontSize: "10px", marginTop: "6px", borderTop: "1px solid var(--line)", paddingTop: "4px" }}>
                        <span style={{ color: "var(--muted)", display: "block", fontSize: "8px", textTransform: "uppercase" }}>主要角色:</span>
                        <span style={{ color: "#cbd5e1", display: "block", maxHeight: "40px", overflowY: "auto", fontSize: "9px" }}>{anime.characters.join("、")}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={submit}
                        disabled={busy}
                        style={{ flex: 1, height: "28px", fontSize: "11px", fontWeight: "bold" }}
                      >
                        {busy ? "提交中" : "提交"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedId(null)}
                        style={{
                          height: "28px",
                          padding: "0 8px",
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid var(--line)",
                          borderRadius: "4px",
                          color: "#fff",
                          cursor: "pointer"
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <div className="no-results">NO MATCH</div>}
        </div>
      </section>
    </div>
  );
}
