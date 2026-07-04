import { jobTotals, workedMs, fmtDate, fmtTime, fmtDur, money } from "../util";
import { TopBar } from "../ui";
import { Icon } from "../icons";

export default function Customers({ db, go, customerId }) {
  const cur = db.settings.currency;

  if (customerId) {
    const c = db.customers.find((x) => x.id === customerId);
    if (!c) {
      return (
        <div className="page">
          <TopBar title="Customer not found" onBack={() => go("customers")} />
        </div>
      );
    }
    const jobs = db.jobs
      .filter((j) => j.customerId === c.id)
      .sort((a, b) => (b.startedAt || b.scheduledFor || 0) - (a.startedAt || a.scheduledFor || 0));
    const billed = jobs.filter((j) => j.status === "done").reduce((s, j) => s + jobTotals(j).total, 0);

    return (
      <div className="page">
        <TopBar title={c.name} sub={c.address} onBack={() => go("customers")} />

        <div className="stats">
          <div className="stat">
            <b>{jobs.length}</b>
            <span>Jobs</span>
          </div>
          <div className="stat">
            <b>{fmtDur(jobs.reduce((s, j) => s + workedMs(j), 0))}</b>
            <span>Worked</span>
          </div>
          <div className="stat">
            <b>{money(billed, cur)}</b>
            <span>Billed</span>
          </div>
        </div>

        {(c.phone || c.email) && (
          <div className="contact-bar">
            {c.phone && (
              <a href={`tel:${c.phone}`}>
                <Icon name="phone" size={17} /> Call
              </a>
            )}
            {c.phone && (
              <a href={`sms:${c.phone}`}>
                <Icon name="message" size={17} /> Text
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`}>
                <Icon name="mail" size={17} /> Email
              </a>
            )}
          </div>
        )}

        <h2>Job history</h2>
        {jobs.length === 0 && (
          <div className="empty">
            <p>No jobs for this customer yet.</p>
          </div>
        )}
        <div className="group">
          {jobs.map((j) => (
            <button
              key={j.id}
              className="grow tappable"
              onClick={() =>
                j.status === "done"
                  ? go("report", { id: j.id })
                  : j.status === "active"
                    ? go("job", { id: j.id })
                    : go("schedule")
              }
            >
              <div className="grow-main">
                <b>{j.startedAt ? fmtDate(j.startedAt) : `${fmtDate(j.scheduledFor)} · ${fmtTime(j.scheduledFor)}`}</b>
                <span>
                  {j.status === "scheduled"
                    ? j.scheduleNote || "Scheduled"
                    : [
                        fmtDur(workedMs(j)),
                        j.materials.length ? `${j.materials.length} materials` : null,
                        j.photos.length ? `${j.photos.length} photos` : null,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                </span>
              </div>
              <div className="grow-side">
                {j.status === "done" && <b>{money(jobTotals(j).total, cur)}</b>}
                <span className={"chip " + j.status}>
                  {j.status === "done" ? "Done" : j.status === "active" ? "Active" : "Scheduled"}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const list = [...db.customers].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page">
      <header className="brand">
        <div className="page-title">Customers</div>
      </header>
      {list.length === 0 && (
        <div className="empty">
          <Icon name="users" size={26} />
          <p>
            Customers get added when you start a job. Every job, photo and dollar stays on their
            record — you never lose history.
          </p>
        </div>
      )}
      <div className="group">
        {list.map((c) => {
          const jobs = db.jobs.filter((j) => j.customerId === c.id);
          const billed = jobs.filter((j) => j.status === "done").reduce((s, j) => s + jobTotals(j).total, 0);
          return (
            <button key={c.id} className="grow tappable" onClick={() => go("customers", { id: c.id })}>
              <div className="grow-main">
                <b>{c.name}</b>
                <span>
                  {jobs.length} job{jobs.length !== 1 ? "s" : ""}
                  {c.phone ? ` • ${c.phone}` : ""}
                </span>
              </div>
              <div className="grow-side">
                <b>{money(billed, cur)}</b>
                <Icon name="chevronRight" size={16} className="chev" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
