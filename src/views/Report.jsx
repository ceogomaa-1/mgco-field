import { workedMs, jobTotals, fmtTime, fmtDate, fmtDur, money, buildReportText, dataURLtoFile } from "../util";
import { TopBar, toast } from "../ui";
import { Icon } from "../icons";

export default function Report({ db, update, go, jobId }) {
  const job = db.jobs.find((j) => j.id === jobId);
  const customer = db.customers.find((c) => c.id === job?.customerId);
  const worker = db.workers.find((w) => w.id === job?.workerId);

  if (!job) {
    return (
      <div className="page">
        <TopBar title="Report not found" onBack={() => go("home")} />
      </div>
    );
  }

  const s = db.settings;
  const cur = s.currency;
  const t = jobTotals(job);
  const text = buildReportText(job, customer, s, worker);
  const before = job.photos.filter((p) => p.kind === "before");
  const after = job.photos.filter((p) => p.kind === "after");

  const smsIt = () => {
    // ?& body combo works across iOS + Android
    location.href = `sms:${customer?.phone || ""}?&body=${encodeURIComponent(text)}`;
  };

  const emailIt = () => {
    const subject = `${s.company || "Job"} — Work Report, ${fmtDate(job.startedAt)}`;
    location.href = `mailto:${customer?.email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  };

  const copyIt = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Report copied — paste it anywhere");
    } catch {
      prompt("Copy the report below:", text);
    }
  };

  const shareIt = async () => {
    try {
      const files = job.photos.map((p, i) => dataURLtoFile(p.data, `photo-${i + 1}.jpg`));
      if (navigator.canShare && navigator.canShare({ files }) && files.length) {
        await navigator.share({ title: "Job Report", text, files });
      } else if (navigator.share) {
        await navigator.share({ title: "Job Report", text });
      } else {
        copyIt();
      }
    } catch {
      /* user cancelled share — fine */
    }
  };

  const deleteJob = () => {
    if (confirm("Delete this job and its report? This can't be undone.")) {
      update((d) => (d.jobs = d.jobs.filter((j) => j.id !== jobId)));
      go("home");
    }
  };

  const actions = [
    { icon: "message", label: "Text", fn: smsIt },
    { icon: "mail", label: "Email", fn: emailIt },
    { icon: "share", label: "Share", fn: shareIt },
    { icon: "copy", label: "Copy", fn: copyIt },
    { icon: "printer", label: "PDF", fn: () => window.print() },
  ];

  return (
    <div className="page">
      <TopBar title="Customer report" onBack={() => go("home")} />

      <div className="share-bar no-print">
        {actions.map((a) => (
          <button key={a.label} onClick={a.fn}>
            <Icon name={a.icon} size={19} />
            <span>{a.label}</span>
          </button>
        ))}
      </div>

      <div className="report-paper">
        {s.banner && <img className="rp-banner" src={s.banner} alt="" />}
        <div className="rp-head">
          {s.logo && <img className="rp-logo" src={s.logo} alt="" />}
          <div className="rp-co">
            <h1>{s.company || "Work Report"}</h1>
            <p>{[s.phone, s.email].filter(Boolean).join(" • ")}</p>
          </div>
          <div className="rp-badge">JOB REPORT</div>
        </div>

        <div className="rp-meta">
          <div>
            <label>Customer</label>
            <b>{customer?.name || "—"}</b>
            {customer?.address && <span>{customer.address}</span>}
          </div>
          <div>
            <label>Date</label>
            <b>{fmtDate(job.startedAt)}</b>
            {worker && <span>Technician: {worker.name}</span>}
          </div>
          <div>
            <label>Time on site</label>
            <b>
              {fmtTime(job.startedAt)} – {job.finishedAt ? fmtTime(job.finishedAt) : "…"}
            </b>
            <span>{fmtDur(workedMs(job))} worked</span>
          </div>
        </div>

        {job.notes && (
          <section>
            <h3>Work performed</h3>
            <p className="rp-notes">{job.notes}</p>
          </section>
        )}

        {job.materials.length > 0 && (
          <section>
            <h3>Materials</h3>
            <table className="rp-table">
              <tbody>
                {job.materials.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td className="num">
                      {m.qty} × {money(m.price, cur)}
                    </td>
                    <td className="num">
                      <b>{money(m.qty * m.price, cur)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="rp-totals">
          <div>
            <span>
              Labor — {t.hrs.toFixed(2)}h × {money(job.rate || 0, cur)}/h
            </span>
            <b>{money(t.labor, cur)}</b>
          </div>
          {t.mats > 0 && (
            <div>
              <span>Materials</span>
              <b>{money(t.mats, cur)}</b>
            </div>
          )}
          {t.tax > 0 && (
            <div>
              <span>Tax ({job.taxRate}%)</span>
              <b>{money(t.tax, cur)}</b>
            </div>
          )}
          <div className="grand">
            <span>TOTAL</span>
            <b>{money(t.total, cur)}</b>
          </div>
        </section>

        {(before.length > 0 || after.length > 0) && (
          <section>
            <h3>Photos</h3>
            <div className="rp-photos">
              {before.length > 0 && (
                <div>
                  <label>BEFORE</label>
                  <div className="rp-ph-grid">
                    {before.map((p) => (
                      <img key={p.id} src={p.data} alt="Before" />
                    ))}
                  </div>
                </div>
              )}
              {after.length > 0 && (
                <div>
                  <label>AFTER</label>
                  <div className="rp-ph-grid">
                    {after.map((p) => (
                      <img key={p.id} src={p.data} alt="After" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        <footer className="rp-foot">
          Thank you for your business!
          <span>{[s.company, s.phone, s.email].filter(Boolean).join(" • ")}</span>
        </footer>
      </div>

      <button className="btn big ghost no-print" onClick={() => go("home")}>
        Done
      </button>
      <button className="link-danger no-print" onClick={deleteJob}>
        Delete this job
      </button>
    </div>
  );
}
