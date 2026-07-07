import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { uid, workedMs, breakMs, onBreak, fmtTimer, fmtTime, fmtDur, fmtDate, money, compressImage } from "../util";
import { TopBar, Sheet, toast } from "../ui";
import { Icon } from "../icons";
import { scanReceipt, aiPolish, localPolish, makeRecognizer, speechSupported } from "../ai";

export default function Job({ db, update, go, jobId, ctx, team }) {
  const job = db.jobs.find((j) => j.id === jobId);
  const [sheet, setSheet] = useState(null); // 'materials' | 'photos' | 'notes' | 'measurements'
  const [voiceOnOpen, setVoiceOnOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!job) {
    return (
      <div className="page">
        <TopBar title="Job not found" onBack={() => go("home")} />
      </div>
    );
  }

  const customer = db.customers.find((c) => c.id === job.customerId);
  const worker =
    job.workerUserId && job.workerUserId !== ctx?.me?.userId
      ? (team || []).find((m) => m.userId === job.workerUserId)
      : null;
  const paused = onBreak(job);
  const cur = db.settings.currency;
  // central mutator: every change bumps rev so background sync uploads it
  const patch = (fn) =>
    update((d) => {
      const j = d.jobs.find((x) => x.id === jobId);
      if (j) {
        fn(j, d);
        j.rev = (j.rev || 0) + 1;
      }
    });

  const toggleBreak = () =>
    patch((j) => {
      if (onBreak(j)) j.breaks[j.breaks.length - 1].end = Date.now();
      else j.breaks.push({ start: Date.now(), end: null });
    });

  // seconds arc within the current minute
  const elapsed = workedMs(job);
  const R = 104;
  const C = 2 * Math.PI * R;
  const prog = (elapsed % 60000) / 60000;

  const openNotes = (withVoice) => {
    setVoiceOnOpen(Boolean(withVoice));
    setSheet("notes");
  };

  return (
    <div className="page">
      <TopBar
        title={customer?.name || "Job"}
        sub={[customer?.address, worker ? `Tech: ${worker.name}` : null].filter(Boolean).join(" • ")}
        onBack={() => go("home")}
      />

      <div className={"timer-card" + (paused ? " paused" : "")}>
        <div className="ring-wrap">
          <svg className="ring" viewBox="0 0 240 240">
            <circle className="ring-track" cx="120" cy="120" r={R} />
            <circle
              className="ring-prog"
              cx="120"
              cy="120"
              r={R}
              strokeDasharray={C}
              strokeDashoffset={C * (1 - prog)}
            />
          </svg>
          <div className="ring-inner">
            <div className="timer-label">{paused ? "ON BREAK" : "ON THE CLOCK"}</div>
            <div className="timer">{fmtTimer(elapsed)}</div>
            <div className="timer-sub">
              Arrived {fmtTime(job.startedAt)}
              {breakMs(job) > 0 ? ` • ${fmtDur(breakMs(job))} break` : ""}
            </div>
          </div>
        </div>
        <button className={"btn-break" + (paused ? " resume" : "")} onClick={toggleBreak}>
          <Icon name={paused ? "play" : "pause"} size={16} />
          {paused ? "Back to work" : "Take a break"}
        </button>
      </div>

      <div className="grid">
        <button className="tile" onClick={() => setSheet("materials")}>
          <span className="tile-ic"><Icon name="package" /></span>
          <b>Materials</b>
          <span>{job.materials.length ? `${job.materials.length} added` : "Parts & prices"}</span>
        </button>
        <button className="tile" onClick={() => setSheet("photos")}>
          <span className="tile-ic"><Icon name="camera" /></span>
          <b>Photos</b>
          <span>{job.photos.length ? `${job.photos.length} taken` : "Before & after"}</span>
        </button>
        <button className="tile" onClick={() => openNotes(false)}>
          <span className="tile-ic"><Icon name="note" /></span>
          <b>Notes</b>
          <span>{job.notes ? "Added ✓" : "What you did"}</span>
        </button>
        <button className="tile" onClick={() => openNotes(true)}>
          <span className="tile-ic accent"><Icon name="mic" /></span>
          <b>Voice note</b>
          <span>You talk, we type</span>
        </button>
        <button className="tile" onClick={() => setSheet("measurements")}>
          <span className="tile-ic"><Icon name="ruler" /></span>
          <b>Measurements</b>
          <span>{(job.measurementNotes || []).length ? `${(job.measurementNotes || []).length} saved` : "Mark on photos"}</span>
        </button>
      </div>

      <button className="btn-finish" onClick={() => go("finish", { id: job.id })}>
        <Icon name="check" size={20} />
        FINISH JOB
      </button>

      <AnimatePresence>
        {sheet === "materials" && (
          <Sheet key="m" title="Materials" onClose={() => setSheet(null)}>
            <Materials job={job} db={db} patch={patch} update={update} cur={cur} />
          </Sheet>
        )}
        {sheet === "photos" && (
          <Sheet key="p" title="Photos" onClose={() => setSheet(null)}>
            <Photos job={job} patch={patch} />
          </Sheet>
        )}
        {sheet === "notes" && (
          <Sheet key="n" title="Job notes" onClose={() => setSheet(null)}>
            <Notes job={job} patch={patch} autoVoice={voiceOnOpen} />
          </Sheet>
        )}
        {sheet === "measurements" && (
          <Sheet key="ms" title="Measurement Notes" onClose={() => setSheet(null)}>
            <MeasurementNotes job={job} go={go} ctx={ctx} team={team} patch={patch} />
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- materials ---------------- */

function Materials({ job, db, patch, update, cur }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanLabel, setScanLabel] = useState("");
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);
  const favs = [...db.favorites].sort((a, b) => b.uses - a.uses).slice(0, 8);

  const add = (n, p, q) => {
    const item = { id: uid(), name: String(n).trim(), qty: Number(q) || 1, price: Number(p) || 0 };
    if (!item.name) return;
    patch((j) => j.materials.push(item));
    update((d) => {
      const f = d.favorites.find((x) => x.name.toLowerCase() === item.name.toLowerCase());
      if (f) {
        f.uses += 1;
        f.price = item.price;
      } else {
        d.favorites.push({ name: item.name, price: item.price, uses: 1 });
      }
      d.favRev = (d.favRev || 0) + 1;
    });
    setName("");
    setQty("1");
    setPrice("");
  };

  // Scans one already-rasterized image (data URL) and adds whatever items come back.
  const scanOneImage = async (dataURL) => {
    const result = await scanReceipt(dataURL);
    const items = (result?.items || []).filter((it) => it.name);
    for (const it of items) add(it.name, it.price, it.qty || 1);
    return items.length;
  };

  const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

  // Shared by both the camera button and the device-upload button — handles
  // any mix of photos and PDFs (PDF pages are rasterized on-device first).
  const processFiles = async (files) => {
    if (!files.length) return;
    setScanning(true);
    let added = 0;
    let failed = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setScanLabel(files.length > 1 ? `Reading receipt ${i + 1} of ${files.length}…` : "Reading receipt…");
        try {
          if (isPdf(f)) {
            const { pdfToImages } = await import("../pdfImages");
            const pages = await pdfToImages(f);
            for (const page of pages) added += await scanOneImage(page);
          } else {
            const image = await compressImage(f, 1400, 0.8);
            added += await scanOneImage(image);
          }
        } catch (err) {
          failed += 1;
          console.warn("receipt scan failed", err);
        }
      }
      if (added > 0) toast(`✓ ${added} item${added > 1 ? "s" : ""} added from receipt${files.length > 1 ? "s" : ""}`);
      else if (failed > 0) toast("AI isn't set up yet — add materials by hand for now");
      else toast("Couldn't read any items off that receipt");
    } finally {
      setScanning(false);
      setScanLabel("");
    }
  };

  const onCamera = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    processFiles(files);
  };

  const onUpload = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    processFiles(files);
  };

  return (
    <div className="stack">
      <div className="receipt-btns">
        <button className="btn secondary" disabled={scanning} onClick={() => cameraRef.current?.click()}>
          <Icon name="camera" size={17} />
          Take photo
        </button>
        <button className="btn secondary" disabled={scanning} onClick={() => uploadRef.current?.click()}>
          <Icon name="receipt" size={17} />
          Upload file
        </button>
      </div>
      {scanning && <div className="dim center">{scanLabel || "Reading receipt…"}</div>}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onCamera} />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={onUpload}
      />

      {favs.length > 0 && (
        <>
          <label className="mini-label">FREQUENTLY USED — TAP TO ADD</label>
          <div className="chips">
            {favs.map((f) => (
              <button key={f.name} onClick={() => add(f.name, f.price, 1)}>
                {f.name} · {money(f.price, cur)}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mat-form">
        <input
          placeholder="Material (e.g. 1/2” shutoff valve)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="mat-row">
          <input
            type="number"
            inputMode="decimal"
            min="1"
            placeholder="Qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder={`Price (${cur})`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <button className="btn primary add" disabled={!name.trim()} onClick={() => add(name, price, qty)}>
            ADD
          </button>
        </div>
      </div>

      <div className="mat-list">
        {job.materials.map((m) => (
          <div key={m.id} className="mat-item">
            <span className="mat-name">
              <b>{m.name}</b>
              <span>
                {m.qty} × {money(m.price, cur)}
              </span>
            </span>
            <b>{money(m.qty * m.price, cur)}</b>
            <button
              className="icon-btn"
              onClick={() => patch((j) => (j.materials = j.materials.filter((x) => x.id !== m.id)))}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
        {job.materials.length === 0 && <div className="dim center">Nothing logged yet.</div>}
        {job.materials.length > 0 && (
          <div className="mat-total">
            <span>Materials total</span>
            <b>{money(job.materials.reduce((s, m) => s + m.qty * m.price, 0), cur)}</b>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- photos ---------------- */

function Photos({ job, patch }) {
  const [busy, setBusy] = useState(false);
  const beforeRef = useRef(null);
  const afterRef = useRef(null);

  const onFiles = async (e, kind) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        const data = await compressImage(f);
        patch((j) => j.photos.push({ id: uid(), kind, data, ts: Date.now() }));
      }
    } catch (err) {
      console.warn("photo failed", err);
    } finally {
      setBusy(false);
    }
  };

  const remove = (id) => {
    if (confirm("Delete this photo?")) patch((j) => (j.photos = j.photos.filter((p) => p.id !== id)));
  };

  const group = (kind, label, ref) => (
    <div className="ph-group">
      <label className="mini-label">{label}</label>
      <div className="ph-grid">
        {job.photos
          .filter((p) => p.kind === kind)
          .map((p) => (
            <img key={p.id} src={p.data} alt={label} onClick={() => remove(p.id)} />
          ))}
        <button className="ph-add" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? "…" : <Icon name="plus" size={22} />}
        </button>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => onFiles(e, kind)}
      />
    </div>
  );

  return (
    <div className="stack">
      {group("before", "BEFORE", beforeRef)}
      {group("after", "AFTER", afterRef)}
      <small className="hint">Tap a photo to delete it. Photos go straight into the customer report.</small>
    </div>
  );
}

/* ---------------- notes (typing + voice + AI polish) ---------------- */

function Notes({ job, patch, autoVoice }) {
  const [val, setVal] = useState(job.notes);
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const valRef = useRef(val);
  const recRef = useRef(null);
  const t = useRef();

  const commit = (v) => {
    valRef.current = v;
    clearTimeout(t.current);
    t.current = setTimeout(() => patch((j) => (j.notes = v)), 400);
  };

  const change = (v) => {
    setVal(v);
    commit(v);
  };

  const stopVoice = () => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
    setInterim("");
  };

  const startVoice = () => {
    const rec = makeRecognizer({
      onText: (final, inter) => {
        setInterim(inter);
        if (final) {
          setVal((prev) => {
            const glue = prev && !/\s$/.test(prev) ? " " : "";
            const next = prev + glue + final.trim();
            commit(next);
            return next;
          });
        }
      },
      onEnd: () => {
        setListening(false);
        setInterim("");
      },
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

  const toggleVoice = () => (listening ? stopVoice() : startVoice());

  useEffect(() => {
    if (autoVoice && speechSupported()) startVoice();
    return () => {
      recRef.current?.stop();
      clearTimeout(t.current);
      patch((j) => (j.notes = valRef.current));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const polish = async () => {
    const text = valRef.current.trim();
    if (!text) return;
    setPolishing(true);
    try {
      let result;
      try {
        result = await aiPolish(text);
      } catch {
        result = localPolish(text);
        toast("AI offline — quick cleanup applied instead");
      }
      if (result) {
        setVal(result);
        commit(result);
      }
    } finally {
      setPolishing(false);
    }
  };

  return (
    <div className="stack">
      <textarea
        className="notes"
        rows={7}
        placeholder="What did you do on this job? Type it — or hit the mic and just talk."
        value={val}
        onChange={(e) => change(e.target.value)}
      />
      {interim && <div className="interim">{interim}…</div>}
      <div className="notes-actions">
        {speechSupported() && (
          <button className={"btn secondary" + (listening ? " rec" : "")} onClick={toggleVoice}>
            <Icon name="mic" size={17} />
            {listening ? "Listening… tap to stop" : "Voice"}
          </button>
        )}
        <button className="btn secondary" disabled={polishing || !val.trim()} onClick={polish}>
          <Icon name="sparkle" size={17} />
          {polishing ? "Polishing…" : "Make it professional"}
        </button>
      </div>
      <small className="hint">This goes on the customer report word-for-word.</small>
    </div>
  );
}

/* ---------------- measurement notes (gallery + capture entry point) ---------------- */

function MeasurementNotes({ job, go, ctx, team, patch }) {
  const camRef = useRef(null);
  const [capturing, setCapturing] = useState(false);
  const notes = [...(job.measurementNotes || [])].sort((a, b) => b.createdAt - a.createdAt);

  const onCapture = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setCapturing(true);
    try {
      const image = await compressImage(f, 1600, 0.82);
      go("measure", { jobId: job.id, draftImage: image });
    } catch (err) {
      console.warn("photo capture failed", err);
      toast("Couldn't open that photo — try again");
    } finally {
      setCapturing(false);
    }
  };

  const remove = (id) => {
    if (confirm("Delete this measurement note?")) {
      patch((j) => (j.measurementNotes = (j.measurementNotes || []).filter((n) => n.id !== id)));
    }
  };

  const nameFor = (userId) =>
    userId === ctx?.me?.userId ? "You" : (team || []).find((m) => m.userId === userId)?.name || "Teammate";

  return (
    <div className="stack">
      <button className="btn big secondary" disabled={capturing} onClick={() => camRef.current?.click()}>
        <Icon name="camera" size={18} />
        {capturing ? "Opening…" : "＋ Add Measurement Note"}
      </button>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onCapture} />

      {notes.length === 0 ? (
        <div className="dim center">
          Snap a wall, door, or anything that needs measurements — mark it up or talk it through,
          it stays attached to this job forever.
        </div>
      ) : (
        <div className="group">
          {notes.map((n) => (
            <div
              key={n.id}
              className="grow measure-row"
              onClick={() => go("measure", { jobId: job.id, noteId: n.id })}
            >
              <img className="measure-thumb" src={n.image} alt="" />
              <div className="grow-main">
                <b>{n.title || "Measurement Note"}</b>
                <span>
                  {fmtDate(n.createdAt)}
                  {n.room ? ` • ${n.room}` : ""} • {nameFor(n.createdBy)}
                </span>
              </div>
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(n.id);
                }}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
