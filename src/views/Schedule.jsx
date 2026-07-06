import { fmtTime, fmtDayLabel, dayStart } from "../util";
import { Icon } from "../icons";

export default function Schedule({ db, update, go, ctx, team }) {
  const scheduled = db.jobs
    .filter((j) => j.status === "scheduled")
    .sort((a, b) => a.scheduledFor - b.scheduledFor);

  const meId = ctx?.me?.userId;
  const cname = (id) => db.customers.find((c) => c.id === id)?.name || "Customer";
  const caddr = (id) => db.customers.find((c) => c.id === id)?.address || "";
  const wname = (id) => {
    if (!id || id === meId) return null;
    return team.find((m) => m.userId === id)?.name || "assigned";
  };
  const mineOrOpen = (j) => !j.workerUserId || j.workerUserId === meId;

  const today = dayStart();

  // group by day; overdue first
  const groups = [];
  for (const j of scheduled) {
    const overdue = j.scheduledFor < today;
    const key = overdue ? "overdue" : dayStart(j.scheduledFor);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: overdue ? "Overdue" : fmtDayLabel(j.scheduledFor), overdue, jobs: [] };
      groups.push(g);
    }
    g.jobs.push(j);
  }
  groups.sort((a, b) => (a.key === "overdue" ? -1 : b.key === "overdue" ? 1 : a.key - b.key));

  const startNow = (id) => {
    update((d) => {
      const j = d.jobs.find((x) => x.id === id);
      if (j) {
        j.startedAt = Date.now();
        j.status = "active";
        j.workerUserId = j.workerUserId || meId || null;
        j.rev = (j.rev || 0) + 1;
      }
    });
    go("job", { id });
  };

  const remove = (id) => {
    if (confirm("Remove this scheduled job?")) {
      update((d) => {
        d.jobs = d.jobs.filter((j) => j.id !== id);
        d.deletedIds.push(id);
      });
    }
  };

  return (
    <div className="page">
      <header className="brand">
        <div className="page-title">Schedule</div>
        <button className="btn small primary" onClick={() => go("schedNew")}>
          <Icon name="plus" size={15} /> New
        </button>
      </header>

      {scheduled.length === 0 && (
        <div className="empty">
          <Icon name="calendar" size={26} />
          <p>
            Nothing on the books. Tap <b>New</b> to line up tomorrow's jobs — they'll be one tap
            away when you get to the site.
          </p>
        </div>
      )}

      {groups.map((g) => (
        <div key={String(g.key)}>
          <h2 className={g.overdue ? "danger" : ""}>{g.label}</h2>
          <div className="group">
            {g.jobs.map((j) => (
              <div key={j.id} className="grow sched-row">
                <div className="sched-time">{fmtTime(j.scheduledFor)}</div>
                <div className="grow-main">
                  <b>{cname(j.customerId)}</b>
                  <span>
                    {[caddr(j.customerId), wname(j.workerUserId), j.scheduleNote].filter(Boolean).join(" • ") ||
                      "No details"}
                  </span>
                </div>
                <div className="sched-actions">
                  {(g.overdue || dayStart(j.scheduledFor) === today) && mineOrOpen(j) && (
                    <button className="btn small primary" onClick={() => startNow(j.id)}>
                      Start
                    </button>
                  )}
                  {(ctx?.role === "owner" || mineOrOpen(j)) && (
                    <button className="icon-btn" onClick={() => remove(j.id)}>
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
