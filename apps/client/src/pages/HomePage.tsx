import { ArrowRight, Gamepad2, Minus, Plus, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HomeAnimeWaterfall } from "../components/HomeAnimeWaterfall";
import { roomActions } from "../store/roomStore";

export function HomePage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const submit = async () => {
    setBusy(true);
    setLocalError("");
    try {
      const identity = mode === "create"
        ? await roomActions.create(name, 10)
        : await roomActions.join(code, name);
      navigate(`/room/${identity.code}`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="home-page">
      <HomeAnimeWaterfall />
      <div className="home-orbit orbit-one" />
      <div className="home-orbit orbit-two" />
      <header className="home-nav">
        <span className="brand-glyph">D/G</span>
        <span>ANIME RELAY</span>
        <i />
        <span className="online-label"><span className="status-dot" /> LOCAL SERVER</span>
      </header>
      <section className="hero-copy">
        <div className="eyebrow"><Sparkles size={15} /> DRAW · GUESS · RELAY</div>
        <h1>动漫猜猜呗</h1>
        <div className="hero-metrics">
          <span><Users size={18} /><strong>2—10</strong><small>PLAYERS</small></span>
          <span><Gamepad2 size={18} /><strong>200</strong><small>ANIME / MATCH</small></span>
        </div>
      </section>
      <section className="entry-card panel">
        <div className="mode-tabs">
          <button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>创建房间</button>
          <button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>加入房间</button>
        </div>
        <label className="field-label">
          <span>NICKNAME</span>
          <input value={name} maxLength={12} onChange={(event) => setName(event.target.value)} placeholder="你的昵称" />
        </label>
        {mode === "join" && (
          <label className="field-label">
            <span>ROOM CODE</span>
            <input className="code-input" value={code} maxLength={4} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="1234" />
          </label>
        )}
        {localError && <p className="field-error">{localError}</p>}
        <button className="primary-button entry-submit" onClick={submit} disabled={busy || !name.trim() || (mode === "join" && code.length !== 4)}>
          {busy ? "连接中" : mode === "create" ? "创建房间" : "进入房间"} <ArrowRight size={19} />
        </button>
        <div className="micro-flow"><span>选题</span><i /><span>绘画</span><i /><span>猜测</span><i /><span>揭晓</span></div>
      </section>
    </main>
  );
}
