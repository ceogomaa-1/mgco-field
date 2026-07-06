import { useState } from "react";
import { weekStart, WEEK_MS, fmtWeekRange, workedMs, jobTotals, fmtDur, money } from "../util";
import { TopBar, toast } from "../ui";
import { Icon } from "../icons";

export default function Payroll({ db, go, ctx, team }) {
  const [ws, setWs] = useState(weekStart());
  const cur = db.settings.currency;
  const isOwner = ctx?.role === "owner";
  const title = isOwner ? "Payroll" : "My hours";

  const weekJobs = db.jobs.filter(
    (j) => j.startedAt && j.startedAt >= ws && j.startedAt < ws + WEEK_MS
  );

  // group by worker (employees only ever have their own jobs locally)
  const buckets = new Map();
  for (const j of weekJobs) {
    const key = j.workerUserId || ctx?.me?.userId || "me";
    if (!buckets.has(key)) buckets.set(key, { jobs: 0, ms: 0, billed: 0 });
    const b = buckets.get(key);
    b.jobs += 1;
    b.ms += workedMs(j);
    if (j.status === "done") b.billed += jobTotals(j).total;
  }

  const rows = [...buckets.entries()].map(([key, b]) => {
    const member = (team || []).find((m) => m.userId === key);
    const isMe = key === ctx?.me?.userId;
    const name = isMe ? "You" : member?.name || "Former worker";
    const wage = member?.wage || 0;
    const hrs = b.ms / 3600000;
    return { key, name, wage, hrs, ms: b.ms, jobs: b.jobs, pay: wage * hrs, billed: b.billed };
  });
  rows.sort((a, b) => b.ms - a.ms);

  const totalMs = rows.reduce((s, r) => s + r.ms, 0);
  const totalPay = rows.reduce((s, r) => s + r.pay, 0);
  const totalBilled = rows.reduce((s, r) => s + r.billed, 0);

  const copySummary = async () => {
    const L = [`${title} — week of ${fmtWeekRange(ws)}`, ""];
    for (const r of rows) {
      L.push(
        `${r.name}: ${r.hrs.toFixed(2)}h over ${r.jobs} job${r.jobs !== 1 ? "s" : ""}` +
          (r.wage ? ` — pay ${money(r.pay, cur)} (${money(r.wage, cur)}/h)` : "")
      );
    }
    L.push("");
    L.push(`Total hours: ${(totalMs / 3600000).toFixed(2)}h`);
    if (totalPay > 0) L.push(`Total payroll: ${money(totalPay, cur)}`);
    L.push(`Total billed: ${money(totalBilled, cur)}`);
    try {
      await navigator.clipboard.writeText(L.join("\n"));
      toast("Summary copied");
    } catch {
      prompt("Copy the summary below:", L.join("\n"));
    }
  };

  return (
    <div className="page">
      <TopBar title={title} onBack={() => go("more")} />

      <div className="week-nav">
        <button className="icon-btn" onClick={() => setWs(ws - WEEK_MS)}>
          <Icon name="chevronLeft" size={18} />
        </button>
        <div className="week-label">
          <b>{fmtWeekRange(ws)}</b>
          <span>{ws === weekStart() ? "This week" : ws === weekStart() - WEEK_MS ? "Last week" : "Week"}</span>
        </div>
        <button className="icon-btn" disabled={ws >= weekStart()} onClick={() => setWs(ws + WEEK_MS)}>
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <b>{fmtDur(totalMs)}</b>
          <span>Hours</span>
        </div>
        {isOwner ? (
          <div className="stat">
            <b>{money(totalPay, cur)}</b>
            <span>Payroll</span>
          </div>
        ) : (
          <div className="stat">
            <b>{rows[0]?.jobs || 0}</b>
            <span>Jobs</span>
          </div>
        )}
        <div className="stat">
          <b>{money(totalBilled, cur)}</b>
          <span>Billed</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <Icon name="dollar" size={26} />
          <p>No hours on the clock this week. Every job's time lands here automatically.</p>
        </div>
      ) : (
        <div className="group">
          {rows.map((r) => (
            <div key={r.key} className="grow">
              <div className="grow-main">
                <b>{r.name}</b>
                <span>
                  {r.hrs.toFixed(2)}h • {r.jobs} job{r.jobs !== 1 ? "s" : ""}
                  {r.billed > 0 ? ` • billed ${money(r.billed, cur)}` : ""}
                </span>
              </div>
              <div className="grow-side">
                {isOwner && r.wage > 0 ? (
                  <b>{money(r.pay, cur)}</b>
                ) : isOwner ? (
                  <span className="dim">no wage set</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <button className="btn big secondary" onClick={copySummary}>
          <Icon name="copy" size={17} /> Copy week summary
        </button>
      )}
    </div>
  );
}
