import { Check, Eraser, Paintbrush, Palette, Undo, Redo } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { socket, useRoomStore } from "../store/roomStore";

type Point = { x: number; y: number };
type Stroke = { mode: "draw" | "erase"; color: string; size: number; points: Point[] };

const PRESETS = ["#111827", "#ffffff", "#ef4444", "#f59e0b", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

function hsvToHex(hue: number, saturation: number, value: number): string {
  const s = saturation / 100;
  const v = value / 100;
  const chroma = v * s;
  const segment = hue / 60;
  const second = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] = segment < 1 ? [chroma, second, 0]
    : segment < 2 ? [second, chroma, 0]
      : segment < 3 ? [0, chroma, second]
        : segment < 4 ? [0, second, chroma]
          : segment < 5 ? [second, 0, chroma]
            : [chroma, 0, second];
  const match = v - chroma;
  return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function hexToHsv(hex: string): { hue: number; saturation: number; value: number } {
  const [red, green, blue] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation: max === 0 ? 0 : (delta / max) * 100, value: max * 100 };
}

export function DrawingBoard({ onSubmit }: { onSubmit: (drawing: string, strokes?: string) => Promise<void> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeRef = useRef<Stroke | null>(null);
  const [mode, setMode] = useState<"draw" | "erase">("draw");
  const initialColor = hexToHsv("#111827");
  const [hue, setHue] = useState(initialColor.hue);
  const [saturation, setSaturation] = useState(initialColor.saturation);
  const [value, setValue] = useState(initialColor.value);
  const [color, setColor] = useState("#111827");
  const [size, setSize] = useState(5);
  const [strokeCount, setStrokeCount] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const redoStrokesRef = useRef<Stroke[]>([]);
  const [redoCount, setRedoCount] = useState(0);

  useEffect(() => setColor(hsvToHex(hue, saturation, value)), [hue, saturation, value]);

  const chooseColor = (nextColor: string) => {
    const hsv = hexToHsv(nextColor);
    setHue(hsv.hue);
    setSaturation(hsv.saturation);
    setValue(hsv.value);
    setColor(nextColor.toLowerCase());
  };

  const pickSpectrum = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.type === "pointermove" && event.buttons !== 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    setSaturation(Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)));
    setValue(Math.max(0, Math.min(100, (1 - (event.clientY - rect.top) / rect.height) * 100)));
  };

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of [...strokesRef.current, ...(activeRef.current ? [activeRef.current] : [])]) {
      if (stroke.points.length === 0) continue;
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
        for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
        context.stroke();
      }
    }
    context.globalCompositeOperation = "source-over";
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const context = canvas.getContext("2d");
      context?.setTransform(ratio, 0, 0, ratio, 0, 0);
      render();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [render]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    activeRef.current = { mode, color, size: mode === "erase" ? size * 1.6 : size, points: [pointFromEvent(event)] };
    render();
  };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeRef.current) return;
    activeRef.current.points.push(pointFromEvent(event));
    render();
  };
  const syncStrokes = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = canvasRef.current;
    if (canvas) {
      const strokesData = JSON.stringify({
        width: canvas.width / ratio,
        height: canvas.height / ratio,
        ratio,
        strokes: strokesRef.current
      });
      socket.emit("draw:strokes:sync", { strokes: strokesData });
    }
  };

  const pointerUp = () => {
    if (!activeRef.current) return;
    strokesRef.current.push(activeRef.current);
    activeRef.current = null;
    redoStrokesRef.current = [];
    setStrokeCount(strokesRef.current.length);
    setRedoCount(0);
    render();
    syncStrokes();
  };

  const undo = () => {
    const popped = strokesRef.current.pop();
    if (popped) {
      redoStrokesRef.current.push(popped);
      setStrokeCount(strokesRef.current.length);
      setRedoCount(redoStrokesRef.current.length);
      render();
      syncStrokes();
    }
  };

  const redo = () => {
    const popped = redoStrokesRef.current.pop();
    if (popped) {
      strokesRef.current.push(popped);
      setStrokeCount(strokesRef.current.length);
      setRedoCount(redoStrokesRef.current.length);
      render();
      syncStrokes();
    }
  };

  const submit = async () => {
    const canvas = canvasRef.current;
    if (!canvas || strokeCount === 0 || submitting) return;
    setSubmitting(true);
    try {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const context = exportCanvas.getContext("2d")!;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      context.drawImage(canvas, 0, 0);

      const strokesData = JSON.stringify({
        width: canvas.width / ratio,
        height: canvas.height / ratio,
        ratio,
        strokes: strokesRef.current
      });
      await onSubmit(exportCanvas.toDataURL("image/png"), strokesData);
    } finally {
      setSubmitting(false);
    }
  };

  const roundEndsAt = useRoomStore((state) => state.view?.roundEndsAt);
  const phase = useRoomStore((state) => state.view?.phase);
  const submitRef = useRef<() => Promise<void>>(undefined);

  useEffect(() => {
    submitRef.current = submit;
  });

  useEffect(() => {
    if (!roundEndsAt || phase !== "DRAW") return;
    const checkTime = () => {
      const remaining = roundEndsAt - Date.now();
      if (remaining <= 0) {
        clearInterval(timerId);
        submitRef.current?.();
      }
    };
    const timerId = setInterval(checkTime, 200);
    return () => clearInterval(timerId);
  }, [roundEndsAt, phase]);

  return (
    <section className="drawing-station panel">
      {/* 左侧垂直侧边栏 - 拓宽到 220px 容纳常驻调色盘 */}
      <div className="canvas-sidebar" style={{
        width: "220px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px",
        background: "#111a2c",
        borderRight: "1px solid var(--line)",
        gap: "12px",
        flexShrink: 0,
        overflowY: "auto"
      }}>
        {/* 工具切换与历史控制 */}
        <div style={{ display: "flex", gap: "10px", width: "100%", justifyContent: "center" }}>
          <button className={`tool-button ${mode === "draw" ? "active" : ""}`} onClick={() => setMode("draw")} title="画笔" style={{ flex: 1, height: "40px", borderRadius: "6px" }}>
            <Paintbrush size={19} />
          </button>
          <button className={`tool-button ${mode === "erase" ? "active" : ""}`} onClick={() => setMode("erase")} title="橡皮" style={{ flex: 1, height: "40px", borderRadius: "6px" }}>
            <Eraser size={19} />
          </button>
        </div>

        <div style={{ display: "flex", gap: "10px", width: "100%", justifyContent: "center" }}>
          <button className="tool-button" onClick={undo} disabled={strokeCount === 0} title="上一步" style={{ flex: 1, height: "40px", borderRadius: "6px" }}>
            <Undo size={19} />
          </button>
          <button className="tool-button" onClick={redo} disabled={redoCount === 0} title="下一步" style={{ flex: 1, height: "40px", borderRadius: "6px" }}>
            <Redo size={19} />
          </button>
        </div>

        <div style={{ height: "1px", width: "100%", background: "var(--line)" }} />

        {/* 常驻调色盘 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
          <span style={{ fontSize: "9px", color: "var(--muted)", fontWeight: "bold", letterSpacing: "0.05em" }}>COLOR / 颜色</span>
          
          {/* 渐变色域 */}
          <div
            className="color-spectrum"
            style={{
              "--hue-color": `hsl(${hue} 100% 50%)`,
              height: "100px",
              width: "100%",
              position: "relative",
              borderRadius: "5px",
              border: "1px solid rgba(255,255,255,0.18)"
            } as React.CSSProperties}
            onPointerDown={pickSpectrum}
            onPointerMove={pickSpectrum}
          >
            <i style={{ left: `${saturation}%`, top: `${100 - value}%` }} />
          </div>

          {/* 色相滑块 */}
          <label className="hue-control" style={{ margin: "4px 0", display: "grid", gridTemplateColumns: "30px 1fr", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "8px", color: "var(--muted)" }}>HUE</span>
            <input type="range" min="0" max="360" value={hue} onChange={(event) => setHue(Number(event.target.value))} style={{ width: "100%" }} />
          </label>

          {/* 色值与预览 */}
          <div className="color-head" style={{ display: "flex", gap: "10px", width: "100%" }}>
            <span className="color-preview" style={{ background: color, width: "40px", height: "32px", borderRadius: "4px", flexShrink: 0 }} />
            <input
              className="hex-input"
              value={color.toUpperCase()}
              onChange={(event) => /^#[0-9a-f]{6}$/i.test(event.target.value) && chooseColor(event.target.value)}
              style={{ flex: 1, height: "32px", fontSize: "11px", padding: "0 8px" }}
            />
          </div>

          {/* 预设颜色 */}
          <div className="preset-grid" style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: "4px", margin: "4px 0" }}>
            {PRESETS.map((preset) => (
              <button
                key={preset}
                style={{ background: preset, aspectRatio: 1, borderRadius: "3px", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer" }}
                onClick={() => chooseColor(preset)}
                aria-label={preset}
              />
            ))}
          </div>
        </div>

        <div style={{ height: "1px", width: "100%", background: "var(--line)" }} />

        {/* SIZE 调节 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <span style={{ fontSize: "9px", color: "var(--muted)", fontWeight: "bold" }}>SIZE / 粗细</span>
            <strong style={{ fontSize: "11px", color: "var(--text)" }}>{size}px</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
            <span style={{
              width: Math.max(4, size / 2),
              height: Math.max(4, size / 2),
              background: mode === "erase" ? "#94a3b8" : color,
              borderRadius: "50%",
              flexShrink: 0
            }} />
            <input
              type="range"
              min="2"
              max="42"
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
              style={{ flex: 1, accentColor: "var(--cyan)" }}
            />
          </div>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className={`drawing-canvas ${mode}`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      />
      <button className="primary-button submit-drawing" onClick={submit} disabled={strokeCount === 0 || submitting}>
        <Check size={19} /> {submitting ? "提交中" : "提交画作"}
      </button>
    </section>
  );
}
