import { useEffect, useRef, useState } from "react";
import { workedMs, breakMs, onBreak, jobTotals, fmtTime, fmtDur, money } from "../util";
import { TopBar, toast } from "../ui";
import { Icon } from "../icons";
import { aiPolish, localPolish } from "../ai";

export default function Finish({ db, update, go, jobId }) {
  const job = db.jobs.find((j) => j.id === jobId);
  const customer = db.customers.find((c) => c.id === job?.customerId);
  const [rate, setRate] = useState(job?.rate ?? db.settings.rate);
  const [taxRate, setTaxRate] = useState(job?.taxRate ?? db.settings.taxRate);
  const [notes, setNotes] = useState(job?.notes || "");
  const [polishing, setPolishing] = useState(false);
  const notesRef = useRef(notes);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!job) return null;

  const cur = db.settings.currency;
  const preview = { ...job, rate: Number(rate) || 0, taxRate: Number(taxRate) || 0 };
  const t = jobTotals(preview);

  const setN = (v) => {
    setNotes(v);
    notesRef.current = v;
  };

  const polish = async () => {
    const text = notesRef.current.trim();
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
      if (result) setN(result);
    } finally {
      setPolishing(false);
    }
  };

  const complete = () => {
    const now = Date.now();
    update((d) => {
      const j = d.jobs.find((x) => x.id === jobId);
      if (!j) return;
      if (onBreak(j)) j.breaks[j.breaks.length - 1].end = now;
      j.finishedAt = now;
      j.rate = Number(rate) || 0;
      j.taxRate = Number(taxRate) || 0;
      j.notes = notesRef.current;
      j.status = "done";
    });
    go("report", { id: jobId });
  };

  return (
    <div className="page">
      <TopBar title="Wrap it up" sub={customer?.name} onBack={() => go("job", { id: jobId })} />

      <div className="card time-summary">
        <div>
          <label>Arrived</label>
          <b>{fmtTime(job.startedAt)}</b>
        </div>
        <div>
          <label>Worked</label>
          <b>{fmtDur(workedMs(job))}</b>
        </div>
        <div>
          <label>Breaks</label>
          <b>{breakMs(job) > 0 ? fmtDur(breakMs(job)) : "—"}</b>
        </div>
      </div>

      <label className="field">
        <span className="label-row">
          Work performed (goes on the report)
          <button className="link-btn" disabled={polishing || !notes.trim()} onClick={polish}>
            <Icon name="sparkle" size={14} />
            {polishing ? "Polishing…" : "Make it professional"}
          </button>
        </span>
        <textarea
          className="notes"
          rows={5}
          placeholder="e.g. Replaced kitchen shutoff valve, installed new faucet, tested for leaks — all good."
          value={notes}
          onChange={(e) => setN(e.target.value)}
        />
      </label>

      <div className="two-col">
        <label className="field">
          <span>Hourly rate ({cur})</span>
          <input type="number" inputMode="decimal" min="0" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <label className="field">
          <span>Tax %</span>
          <input type="number" inputMode="decimal" min="0" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
        </label>
      </div>

      <div className="card totals">
        <div>
          <span>
            Labor — {t.hrs.toFixed(2)}h × {money(preview.rate, cur)}/h
          </span>
          <b>{money(t.labor, cur)}</b>
        </div>
        <div>
          <span>Materials ({job.materials.length})</span>
          <b>{money(t.mats, cur)}</b>
        </div>
        {t.tax > 0 && (
          <div>
            <span>Tax ({preview.taxRate}%)</span>
            <b>{money(t.tax, cur)}</b>
          </div>
        )}
        <div className="grand">
          <span>TOTAL</span>
          <b>{money(t.total, cur)}</b>
        </div>
      </div>

      <button className="btn-finish" onClick={complete}>
        <Icon name="check" size={20} />
        COMPLETE &amp; CREATE REPORT
      </button>
      <button className="btn big ghost" onClick={() => go("job", { id: jobId })}>
        Not done yet — back to the job
      </button>
    </div>
  );
}
