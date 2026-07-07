import { useMemo, useRef, useState } from "react";
import { uid, fmtDate } from "../util";
import { Icon } from "../icons";
import { toast } from "../ui";
import { makeRecognizer, speechSupported, suggestAnnotations } from "../ai";

const TOOLS = [
  { key: "select", icon: "move", label: "Select" },
  { key: "line", icon: "lineDiag", label: "Line" },
  { key: "rect", icon: "square", label: "Rect" },
  { key: "circle", icon: "circleTool", label: "Circle" },
  { key: "label", icon: "note", label: "Text" },
];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const V = 1000; // SVG viewBox units per axis

function ensureMinSize(type, x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  if (dist >= 0.025) return { x1, y1, x2, y2 };
  if (type === "line") return { x1: clamp01(x1 - 0.06), y1, x2: clamp01(x1 + 0.06), y2: y1 };
  if (type === "rect")
    return { x1: clamp01(x1 - 0.06), y1: clamp01(y1 - 0.045), x2: clamp01(x1 + 0.06), y2: clamp01(y1 + 0.045) };
  if (type === "circle") return { x1, y1, x2: clamp01(x1 + 0.055), y2: y1 };
  return { x1, y1, x2, y2 };
}

function defaultChip(type, x1, y1, x2, y2) {
  if (type === "line") return { lx: clamp01((x1 + x2) / 2), ly: clamp01(Math.min(y1, y2) - 0.035) };
  if (type === "rect") return { lx: clamp01(Math.min(x1, x2)), ly: clamp01(Math.min(y1, y2) - 0.035) };
  if (type === "circle") {
    const r = Math.hypot(x2 - x1, y2 - y1);
    return { lx: x1, ly: clamp01(y1 - r - 0.035) };
  }
  return { lx: x1, ly: y1 };
}

function arrowHead(x1, y1, x2, y2) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const len = 26, w = 15;
  const bx = x2 - len * Math.cos(ang), by = y2 - len * Math.sin(ang);
  const px = Math.cos(ang + Math.PI / 2) * (w / 2), py = Math.sin(ang + Math.PI / 2) * (w / 2);
  return `${x2},${y2} ${bx + px},${by + py} ${bx - px},${by - py}`;
}

function labelPreview(a) {
  if (a.text) return a.text;
  return a.type === "line" ? "Line" : a.type === "rect" ? "Rectangle" : a.type === "circle" ? "Circle" : "Label";
}

function freshNote({ jobId, image, userId, userName }) {
  return {
    id: uid(),
    jobId,
    title: "",
    room: "",
    createdBy: userId,
    createdByName: userName,
    createdAt: Date.now(),
    image,
    annotations: [],
    transcript: "",
  };
}

export default function MeasureEditor({ db, update, go, ctx, jobId, noteId, draftImage }) {
  const job = db.jobs.find((j) => j.id === jobId);
  const existing = job && noteId ? (job.measurementNotes || []).find((n) => n.id === noteId) : null;

  const initialNote = useMemo(
    () =>
      existing
        ? structuredClone(existing)
        : freshNote({ jobId, image: draftImage, userId: ctx?.me?.userId, userName: ctx?.me?.name || "You" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [title, setTitle] = useState(initialNote.title || "");
  const [room, setRoom] = useState(initialNote.room || "");
  const [annotations, setAnnotations] = useState(initialNote.annotations || []);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const [tool, setTool] = useState("select");
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const [selectedId, setSelectedId] = useState(null);
  const [editingChip, setEditingChip] = useState(null); // { id }
  const [drawing, setDrawing] = useState(false);
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const [drawStart, setDrawStart] = useState(null);
  const drawStartRef = useRef(drawStart);
  drawStartRef.current = drawStart;
  const [drawCur, setDrawCur] = useState(null);
  const drawCurRef = useRef(drawCur);
  drawCurRef.current = drawCur;
  const [imgSize, setImgSize] = useState(null); // { w, h }

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [transcript, setTranscript] = useState(initialNote.transcript || "");

  const canvasRef = useRef(null);
  const recRef = useRef(null);
  const historyRef = useRef([initialNote.annotations || []]);
  const histIdxRef = useRef(0);
  const dragRef = useRef(null); // { id, part, start:{x,y}, origin:{...} }
  const dirtyRef = useRef(false);

  const canUndo = histIdxRef.current > 0;
  const canRedo = histIdxRef.current < historyRef.current.length - 1;

  const commitAnnotations = (next) => {
    const h = historyRef.current.slice(0, histIdxRef.current + 1);
    h.push(next);
    if (h.length > 40) h.shift();
    historyRef.current = h;
    histIdxRef.current = h.length - 1;
    setAnnotations(next);
    dirtyRef.current = true;
  };

  const undo = () => {
    if (!canUndo) return;
    histIdxRef.current -= 1;
    setAnnotations(historyRef.current[histIdxRef.current]);
  };
  const redo = () => {
    if (!canRedo) return;
    histIdxRef.current += 1;
    setAnnotations(historyRef.current[histIdxRef.current]);
  };

  if (!job) {
    return (
      <div className="measure-page">
        <div className="measure-head">
          <button className="icon-btn" onClick={() => go("home")}>
            <Icon name="chevronLeft" size={20} />
          </button>
        </div>
        <div className="dim center">Job not found.</div>
      </div>
    );
  }

  const point = (clientX, clientY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: clamp01((clientX - rect.left) / rect.width), y: clamp01((clientY - rect.top) / rect.height) };
  };

  const closeChipEditor = () => {
    if (!editingChip) return;
    commitAnnotations(annotationsRef.current);
    setEditingChip(null);
  };

  const deselect = () => setSelectedId(null);

  /* ---------------- pointer handling (draw / select / drag) ---------------- */

  const handleDown = (e) => {
    if (editingChip) {
      closeChipEditor();
      return;
    }
    try {
      canvasRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already inactive (rare) — continue without capture */
    }
    const p = point(e.clientX, e.clientY);

    if (toolRef.current !== "select") {
      setDrawing(true);
      setDrawStart(p);
      setDrawCur(p);
      return;
    }

    const hit = e.target.closest && e.target.closest("[data-role]");
    if (!hit) {
      deselect();
      return;
    }
    const id = hit.dataset.id;
    const part = hit.dataset.role;
    const anno = annotationsRef.current.find((a) => a.id === id);
    if (!anno) return;
    setSelectedId(id);
    dragRef.current = { id, part, start: p, origin: { ...anno } };
  };

  const handleMove = (e) => {
    const p = point(e.clientX, e.clientY);
    if (drawingRef.current) {
      setDrawCur(p);
      return;
    }
    if (dragRef.current) {
      const { id, part, start, origin } = dragRef.current;
      const dx = p.x - start.x, dy = p.y - start.y;
      setAnnotations((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          const n = { ...a };
          if (a.type === "label") {
            if (part === "chip") {
              n.x1 = clamp01(origin.x1 + dx);
              n.y1 = clamp01(origin.y1 + dy);
            }
            return n;
          }
          if (part === "geom") {
            n.x1 = clamp01(origin.x1 + dx);
            n.y1 = clamp01(origin.y1 + dy);
            n.x2 = clamp01(origin.x2 + dx);
            n.y2 = clamp01(origin.y2 + dy);
            n.lx = clamp01(origin.lx + dx);
            n.ly = clamp01(origin.ly + dy);
          } else if (part === "p1") {
            n.x1 = clamp01(origin.x1 + dx);
            n.y1 = clamp01(origin.y1 + dy);
            if (a.type === "circle") {
              n.x2 = clamp01(origin.x2 + dx);
              n.y2 = clamp01(origin.y2 + dy);
            }
          } else if (part === "p2") {
            n.x2 = clamp01(origin.x2 + dx);
            n.y2 = clamp01(origin.y2 + dy);
          } else if (part === "chip") {
            n.lx = clamp01(origin.lx + dx);
            n.ly = clamp01(origin.ly + dy);
          }
          return n;
        })
      );
    }
  };

  const handleUp = (e) => {
    try {
      canvasRef.current.releasePointerCapture(e.pointerId);
    } catch {
      /* already released/inactive — nothing to do */
    }
    if (drawingRef.current) {
      setDrawing(false);
      const start = drawStartRef.current, cur = drawCurRef.current, curTool = toolRef.current;
      if (!start || !cur) return;
      if (curTool === "label") {
        const newAnno = { id: uid(), type: "label", x1: start.x, y1: start.y, x2: start.x, y2: start.y, lx: start.x, ly: start.y, text: "", source: "manual" };
        const next = [...annotationsRef.current, newAnno];
        commitAnnotations(next);
        setSelectedId(newAnno.id);
        setEditingChip({ id: newAnno.id });
      } else {
        const sized = ensureMinSize(curTool, start.x, start.y, cur.x, cur.y);
        const chip = defaultChip(curTool, sized.x1, sized.y1, sized.x2, sized.y2);
        const newAnno = { id: uid(), type: curTool, ...sized, ...chip, arrow: false, text: "", source: "manual" };
        const next = [...annotationsRef.current, newAnno];
        commitAnnotations(next);
        setSelectedId(newAnno.id);
        setEditingChip({ id: newAnno.id });
      }
      setDrawStart(null);
      setDrawCur(null);
      return;
    }
    if (dragRef.current) {
      dragRef.current = null;
      commitAnnotations(annotationsRef.current);
    }
  };

  /* ---------------- selection actions ---------------- */

  const selected = annotations.find((a) => a.id === selectedId) || null;

  const deleteSelected = () => {
    if (!selectedId) return;
    commitAnnotations(annotationsRef.current.filter((a) => a.id !== selectedId));
    setSelectedId(null);
  };

  const toggleArrow = () => {
    if (!selected) return;
    commitAnnotations(annotationsRef.current.map((a) => (a.id === selectedId ? { ...a, arrow: !a.arrow } : a)));
  };

  /* ---------------- voice + AI ---------------- */

  const finalBufRef = useRef("");

  const startVoice = () => {
    finalBufRef.current = "";
    const rec = makeRecognizer({
      onText: (final, inter) => {
        if (final) finalBufRef.current += (finalBufRef.current ? " " : "") + final.trim();
        setInterim(inter);
      },
      onEnd: () => finishVoice(),
    });
    if (!rec) return;
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const finishVoice = async () => {
    setListening(false);
    setInterim("");
    const said = finalBufRef.current.trim();
    if (!said) return;
    setTranscript((prev) => (prev ? prev + "\n" + said : said));
    setSuggesting(true);
    try {
      const existingTexts = annotationsRef.current.filter((a) => a.text).map((a) => a.text);
      const result = await suggestAnnotations(said, initialNote.image, existingTexts);
      const items = Array.isArray(result?.items) ? result.items : [];
      if (items.length) {
        const added = items.map((it) => {
          const x = clamp01(Number(it.x));
          const y = clamp01(Number(it.y));
          const t = String(it.type || "label");
          if (t === "label")
            return { id: uid(), type: "label", x1: x, y1: y, x2: x, y2: y, lx: x, ly: y, text: String(it.text || ""), source: "ai" };
          const sized = ensureMinSize(t, x, y, clamp01(x + 0.08), t === "rect" ? clamp01(y + 0.06) : y);
          const chip = defaultChip(t, sized.x1, sized.y1, sized.x2, sized.y2);
          return { id: uid(), type: t, ...sized, ...chip, arrow: false, text: String(it.text || ""), source: "ai" };
        });
        commitAnnotations([...annotationsRef.current, ...added]);
        toast(`✓ ${added.length} note${added.length > 1 ? "s" : ""} organized — drag to adjust`);
      } else {
        toast("Saved your voice note as text");
      }
    } catch (err) {
      console.warn("annotate failed", err);
      const fallback = {
        id: uid(),
        type: "label",
        x1: 0.5,
        y1: 0.5,
        x2: 0.5,
        y2: 0.5,
        lx: 0.5,
        ly: 0.5,
        text: said.length > 200 ? said.slice(0, 200) + "…" : said,
        source: "manual",
      };
      commitAnnotations([...annotationsRef.current, fallback]);
      toast("Saved as a note — AI organizing isn't available right now");
    } finally {
      setSuggesting(false);
    }
  };

  const stopVoice = () => recRef.current?.stop();
  const toggleVoice = () => (listening ? stopVoice() : startVoice());

  /* ---------------- save / back ---------------- */

  const handleBack = () => {
    const changed =
      dirtyRef.current ||
      title !== (initialNote.title || "") ||
      room !== (initialNote.room || "") ||
      transcript !== (initialNote.transcript || "");
    if (changed && !confirm("Discard changes to this measurement note?")) return;
    go("job", { id: jobId });
  };

  const handleSave = () => {
    closeChipEditor();
    const finalNote = {
      ...initialNote,
      title: title.trim(),
      room: room.trim(),
      annotations: annotationsRef.current,
      transcript,
      updatedAt: Date.now(),
    };
    update((d) => {
      const j = d.jobs.find((x) => x.id === jobId);
      if (!j) return;
      j.measurementNotes = j.measurementNotes || [];
      const idx = j.measurementNotes.findIndex((n) => n.id === finalNote.id);
      if (idx === -1) j.measurementNotes.push(finalNote);
      else j.measurementNotes[idx] = finalNote;
      j.rev = (j.rev || 0) + 1;
    });
    toast("Measurement note saved");
    go("job", { id: jobId });
  };

  /* ---------------- render helpers ---------------- */

  const renderGeom = (a, opts = {}) => {
    const { preview, isSelected } = opts;
    const x1 = a.x1 * V, y1 = a.y1 * V, x2 = a.x2 * V, y2 = a.y2 * V;
    const strokeW = 6;
    const commonProps = preview
      ? { strokeDasharray: "10 8", opacity: 0.85 }
      : {};
    const dataProps = preview ? {} : { "data-role": "geom", "data-id": a.id, style: { cursor: "move" } };

    const halo = isSelected && !preview;
    const haloProps = { stroke: "var(--accent)", strokeOpacity: 0.3, strokeWidth: strokeW + 10, strokeDasharray: "2 9", fill: "none", strokeLinecap: "round" };

    if (a.type === "line") {
      return (
        <g key={a.id}>
          {/* invisible fat hit-path — a 6-unit visible stroke is nearly impossible to tap
              precisely with a finger (let alone a gloved one), so tapping/dragging is
              handled by this much wider, unpainted-but-hit-testable line instead */}
          {!preview && (
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(0,0,0,0.001)"
              strokeWidth={46}
              strokeLinecap="round"
              data-role="geom"
              data-id={a.id}
              style={{ cursor: "move" }}
            />
          )}
          {halo && <line x1={x1} y1={y1} x2={x2} y2={y2} {...haloProps} />}
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="var(--accent)"
            strokeWidth={strokeW}
            strokeLinecap="round"
            {...commonProps}
            style={{ pointerEvents: "none" }}
          />
          {a.arrow && <polygon points={arrowHead(x1, y1, x2, y2)} fill="var(--accent)" />}
        </g>
      );
    }
    if (a.type === "rect") {
      const rx = Math.min(x1, x2), ry = Math.min(y1, y2), rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
      return (
        <g key={a.id}>
          {halo && <rect x={rx} y={ry} width={rw} height={rh} rx={6} {...haloProps} />}
          <rect x={rx} y={ry} width={rw} height={rh} rx={6} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={strokeW} {...commonProps} {...dataProps} />
        </g>
      );
    }
    if (a.type === "circle") {
      const r = Math.hypot(x2 - x1, y2 - y1);
      return (
        <g key={a.id}>
          {halo && <circle cx={x1} cy={y1} r={r} {...haloProps} />}
          <circle cx={x1} cy={y1} r={r} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={strokeW} {...commonProps} {...dataProps} />
        </g>
      );
    }
    return null;
  };

  const renderHandles = (a) => {
    if (a.type === "label") return null;
    const hp = (x, y, role) => (
      <circle
        key={role}
        cx={x * V}
        cy={y * V}
        r={17}
        fill="var(--accent)"
        stroke="#fff"
        strokeWidth={3}
        data-role={role}
        data-id={a.id}
        style={{ cursor: "grab" }}
      />
    );
    return (
      <>
        {hp(a.x1, a.y1, "p1")}
        {hp(a.x2, a.y2, "p2")}
      </>
    );
  };

  const previewAnno =
    drawing && drawStart && drawCur && tool !== "select" && tool !== "label"
      ? { id: "__preview", type: tool, x1: drawStart.x, y1: drawStart.y, x2: drawCur.x, y2: drawCur.y, arrow: false }
      : null;

  const chipsToShow = annotations.filter((a) => a.type === "label" || a.text);

  return (
    <div className="measure-page">
      <div className="measure-head">
        <button className="icon-btn" onClick={handleBack}>
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className="measure-head-actions">
          <button className="icon-btn" disabled={!canUndo} onClick={undo}>
            <Icon name="undo" size={18} />
          </button>
          <button className="icon-btn" disabled={!canRedo} onClick={redo}>
            <Icon name="redo" size={18} />
          </button>
          <button className="btn small primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>

      <div className="measure-meta-row">
        <input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input placeholder="Room" value={room} onChange={(e) => setRoom(e.target.value)} className="measure-room" />
      </div>

      <div className="measure-canvas-wrap">
        <div
          className="measure-canvas"
          ref={canvasRef}
          style={imgSize ? { aspectRatio: `${imgSize.w} / ${imgSize.h}` } : { aspectRatio: "4 / 3" }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
        >
          <img
            src={initialNote.image}
            alt=""
            draggable={false}
            onLoad={(e) => setImgSize({ w: e.target.naturalWidth || 4, h: e.target.naturalHeight || 3 })}
          />
          <svg className="measure-svg" viewBox={`0 0 ${V} ${V}`} preserveAspectRatio="none">
            {annotations.map((a) => renderGeom(a, { isSelected: a.id === selectedId && tool === "select" }))}
            {previewAnno && renderGeom(previewAnno, { preview: true })}
            {selected && tool === "select" && renderHandles(selected)}
          </svg>
          <div className="measure-chips">
            {chipsToShow.map((a) => {
              const cx = a.type === "label" ? a.x1 : a.lx;
              const cy = a.type === "label" ? a.y1 : a.ly;
              return (
                <div
                  key={a.id}
                  className={"measure-chip" + (a.id === selectedId ? " sel" : "") + (a.text ? "" : " blank")}
                  style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}
                  data-role="chip"
                  data-id={a.id}
                >
                  {a.text || "…"}
                </div>
              );
            })}
            {editingChip && (
              <TextPopover
                key={editingChip.id}
                anno={annotations.find((a) => a.id === editingChip.id)}
                onChange={(text) =>
                  setAnnotations((prev) => prev.map((a) => (a.id === editingChip.id ? { ...a, text } : a)))
                }
                onDone={closeChipEditor}
              />
            )}
          </div>
        </div>
      </div>

      {(listening || interim) && (
        <div className="measure-voice-banner">
          <span className={"pulse-dot" + (listening ? "" : " hold")} />
          {interim ? `${interim}…` : "Listening…"}
        </div>
      )}
      {suggesting && (
        <div className="measure-voice-banner busy">
          <Icon name="sparkle" size={15} />
          Organizing your notes…
        </div>
      )}

      {selected && tool === "select" && !editingChip && (
        <div className="measure-selbar">
          <span className="measure-selbar-text">{labelPreview(selected)}</span>
          <div className="measure-selbar-actions">
            {selected.type === "line" && (
              <button className={"btn small" + (selected.arrow ? " primary" : " secondary")} onClick={toggleArrow}>
                Arrow
              </button>
            )}
            <button className="icon-btn" onClick={() => setEditingChip({ id: selected.id })}>
              <Icon name="pencil" size={16} />
            </button>
            <button className="icon-btn" onClick={deleteSelected}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="measure-toolbar">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            className={"measure-tool" + (tool === t.key ? " on" : "")}
            onClick={() => {
              setTool(t.key);
              deselect();
            }}
          >
            <Icon name={t.icon} size={20} />
          </button>
        ))}
        {speechSupported() && (
          <button className={"measure-mic" + (listening ? " rec" : "")} onClick={toggleVoice}>
            <Icon name="mic" size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

function TextPopover({ anno, onChange, onDone }) {
  if (!anno) return null;
  const x = anno.type === "label" ? anno.x1 : anno.lx;
  const y = anno.type === "label" ? anno.y1 : anno.ly;
  const above = y > 0.35;
  return (
    <div
      className="measure-popover"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: above ? "translate(-50%, calc(-100% - 14px))" : "translate(-50%, 14px)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        placeholder="Label or measurement…"
        value={anno.text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onDone()}
      />
      <button className="icon-btn" onClick={onDone}>
        <Icon name="check" size={16} />
      </button>
    </div>
  );
}
