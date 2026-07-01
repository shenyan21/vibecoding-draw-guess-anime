import type { Anime } from "@drawandguess/game-core";
import { Star } from "lucide-react";

export function AnimeCard({
  anime,
  selected = false,
  compact = false,
  onClick,
}: {
  anime: Anime;
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "article";
  return (
    <Tag className={`anime-card ${selected ? "selected" : ""} ${compact ? "compact" : ""}`} onClick={onClick}>
      <div className="anime-poster-wrap">
        <div className="anime-poster-blur" style={{ backgroundImage: `url(${anime.image})` }} />
        <img className="anime-poster" src={anime.image} alt="" />
        <span className="rank-badge">#{anime.rank}</span>
      </div>
      <div className="anime-card-copy">
        <div>
          <strong title={anime.name}>{anime.name}</strong>
          <span>
            <Star size={13} fill="currentColor" /> {anime.score.toFixed(1)}
            <i /> {anime.date.slice(0, 4) || "—"}
          </span>
          {!compact && (
            <>
              {anime.aliases && anime.aliases.length > 0 && (
                <span style={{ fontSize: "10px", color: "var(--muted)", display: "block", marginTop: "4px", textAlign: "left", wordBreak: "break-all" }}>
                  {anime.aliases.join(" / ")}
                </span>
              )}
              <div className="tag-row" style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "8px" }}>
                {anime.tags.slice(0, 10).map((tag) => <em key={tag} style={{ fontSize: "8px", padding: "2px 4px" }}>{tag}</em>)}
              </div>
            </>
          )}
        </div>
        {!compact && anime.characters.length > 0 && (
          <p className="character-line" style={{ margin: "8px 0 0", color: "#8392aa", fontSize: "10px", textAlign: "left", whiteSpace: "normal", wordBreak: "break-all" }}>
            {anime.characters.slice(0, 6).join(" · ")}
          </p>
        )}
      </div>
    </Tag>
  );
}
