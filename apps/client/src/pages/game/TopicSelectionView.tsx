import type { TopicOffer } from "@drawandguess/game-core";
import { Check, RefreshCw } from "lucide-react";
import { useState } from "react";
import { AnimeCard } from "../../components/AnimeCard";
import { roomActions } from "../../store/roomStore";

export function TopicSelectionView({ offer }: { offer: TopicOffer }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    try { await roomActions.submitTopic(selected); } finally { setBusy(false); }
  };
  return (
    <section className="topic-view">
      <div className="topic-grid">
        {offer.anime.map((anime, index) => (
          <div className="topic-slot" key={anime.id}>
            <span className="slot-number">0{index + 1}</span>
            <AnimeCard anime={anime} selected={selected === anime.id} onClick={() => setSelected(anime.id)} />
            <button className="refresh-button" disabled={offer.refreshed[index]} onClick={() => roomActions.refreshTopic(index)} title="换一部">
              <RefreshCw size={16} />
            </button>
          </div>
        ))}
      </div>
      <button className="primary-button topic-submit" disabled={!selected || busy} onClick={submit}>
        <Check size={18} />
      </button>
    </section>
  );
}
