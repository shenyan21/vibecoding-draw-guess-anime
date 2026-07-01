import type { Anime } from "@drawandguess/game-core";
import { Star, Users } from "lucide-react";

export function AnimeBrief({ anime, label = "题目" }: { anime: Anime; label?: string }) {
  return (
    <aside className="anime-brief panel" style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <div className="panel-label">
        <span className="status-dot" />
        <span style={{ color: "var(--cyan)", fontWeight: "bold" }}>{label}</span>
        <span className="brief-rank" style={{ marginLeft: "auto" }}>BGM #{anime.rank}</span>
      </div>
      <div className="anime-poster-wrap" style={{ height: "320px", width: "100%", overflow: "hidden", flexShrink: 0, position: "relative" }}>
        <div className="anime-poster-blur" style={{ backgroundImage: `url(${anime.image})` }} />
        <img className="anime-poster" src={anime.image} alt="" style={{ position: "relative", zIndex: 1, width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <div className="brief-copy" style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", padding: "16px" }}>
        <h2>{anime.name}</h2>
        {anime.aliases && anime.aliases.length > 0 && (
          <div style={{ fontSize: "10px", color: "var(--muted)", marginBottom: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {anime.aliases.join(" / ")}
          </div>
        )}
        <div className="brief-stats">
          <span><Star size={15} fill="currentColor" /> {anime.score.toFixed(1)}</span>
          <span><Users size={15} /> {anime.votes.toLocaleString()}</span>
          <span>{anime.date.slice(0, 4) || "—"}</span>
        </div>
        <div className="tag-row" style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "10px" }}>
          {anime.tags.slice(0, 10).map((tag) => <em key={tag}>{tag}</em>)}
        </div>
        {anime.characters.length > 0 && (
          <p className="character-line" style={{ margin: "12px 0 0", color: "#8392aa", fontSize: "10px", lineHeight: "1.4", wordBreak: "break-all", whiteSpace: "normal" }}>
            {anime.characters.slice(0, 6).join(" · ")}
          </p>
        )}
      </div>
    </aside>
  );
}
