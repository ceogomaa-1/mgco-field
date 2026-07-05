import { useEffect, useState } from "react";
import { Icon } from "../icons";
import {
  jobTotals, workedMs, fmtDur, fmtDate, fmtTime, fmtTimer, money, isToday,
  dayStart, onBreak, greeting,
} from "../util";

export default function Home({ db, update, go, active }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [active]);

  const s = db.settings;
  const cur = s.currency;
  const started = db.jobs.filter((j) => j.startedAt);
  const doneToday = started.filter((j) => j.status === "done" && isToday(j.startedAt));
  const workedToday = started.filter((j) => isToday(j.startedAt)).reduce((s, j) => s + workedMs(j), 0);
  const billedToday = doneToday.reduce((s, j) => s + jobTotals(j).total, 0);

  const recent = [...started].sort((a, b) => b.startedAt - a.startedAt).slice(0, 25);
  const cname = (id) => db.customers.find((c) => c.id === id)?.name || "Customer";

  const upNext = db.jobs
    .filter((j) => j.status === "scheduled" && j.scheduledFor < dayStart() + 86400000)
    .sort((a, b) => a.scheduledFor - b.scheduledFor)
    .slice(0, 2);

  const startScheduled = (id) => {
    update((d) => {
      const j = d.jobs.find((x) => x.id === id);
      if (j) {
        j.startedAt = Date.now();
        j.status = "active";
      }
    });
    go("job", { id });
  };

  return (
    <div className="page">
      <header className="brand">
        <button className="brand-id" onClick={() => go("company")}>
          {s.logo && <img className="brand-logo" src={s.logo} alt="" />}
          <span className={"brand-name" + (s.company ? "" : " unset")}>
            {s.company || "Set up your brand"}
          </span>
        </button>
        <div className="brand-date">{fmtDate(Date.now())}</div>
      </header>

      {s.banner && <img className="home-banner" src={s.banner} alt="" />}

      <h1 className="greet">{greeting()}.</h1>

      <div className="stats">
        <div className="stat">
          <b>{doneToday.length}</b>
          <span>Jobs done</span>
        </div>
        <div className="stat">
          <b>{fmtDur(workedToday)}</b>
          <span>On the clock</span>
        </div>
        <div className="stat">
          <b>{money(billedToday, cur)}</b>
          <span>Billed</span>
        </div>
      </div>

      {active ? (
        <button className="btn-start resume" onClick={() => go("job", { id: active.id })}>
          <span className={"pulse" + (onBreak(active) ? " hold" : "")} />
          <span className="resume-txt">
            <b>{onBreak(active) ? "ON BREAK" : "JOB RUNNING"}</b>
            <small>{cname(active.customerId)} — tap to open</small>
          </span>
          <span className="mini-timer">{fmtTimer(workedMs(active))}</span>
        </button>
      ) : (
        <button className="btn-start" onClick={() => go("pick")}>
          <Icon name="play" size={22} />
          START JOB
        </button>
      )}

      {upNext.length > 0 && !active && (
        <>
          <h2>Up next</h2>
          <div className="group">
            {upNext.map((j) => (
              <div key={j.id} className="grow">
                <div className="grow-main">
                  <b>{cname(j.customerId)}</b>
                  <span>
                    {fmtTime(j.scheduledFor)}
                    {j.scheduleNote ? ` • ${j.scheduleNote}` : ""}
                  </span>
                </div>
                <button className="btn small primary" onClick={() => startScheduled(j.id)}>
                  Start
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Recent jobs</h2>
      {recent.length === 0 ? (
        <div className="empty">
          <Icon name="clock" size={26} />
          <p>
            No jobs yet. When you get to the site, hit <b>Start Job</b> — the clock, materials,
            photos and the customer report take care of themselves.
          </p>
        </div>
      ) : (
        <div className="group">
          {recent.map((j) => (
            <button
              key={j.id}
              className="grow tappable"
              onClick={() => go(j.status === "done" ? "report" : "job", { id: j.id })}
            >
              <div className="grow-main">
                <b>{cname(j.customerId)}</b>
                <span>
                  {fmtDate(j.startedAt)} • {fmtDur(workedMs(j))}
                </span>
              </div>
              <div className="grow-side">
                {j.status === "done" ? (
                  <b>{money(jobTotals(j).total, cur)}</b>
                ) : (
                  <span className="chip active">Active</span>
                )}
                <Icon name="chevronRight" size={16} className="chev" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
