import { Icon } from "../icons";

export default function More({ db, go }) {
  const rows = [
    { icon: "dollar", label: "Payroll", sub: "Hours & pay, week by week", view: "payroll" },
    { icon: "users", label: "Team", sub: `${db.workers.length || "No"} worker${db.workers.length === 1 ? "" : "s"} added`, view: "team" },
    { icon: "briefcase", label: "Company & billing", sub: "Logo, rates, tax", view: "company" },
    { icon: "sparkle", label: "AI Assistant", sub: "Voice notes & receipt scanning", view: "assistant" },
  ];

  return (
    <div className="page">
      <header className="brand">
        <div className="page-title">More</div>
      </header>

      <div className="group">
        {rows.map((r) => (
          <button key={r.view} className="grow tappable" onClick={() => go(r.view)}>
            <span className="row-ic">
              <Icon name={r.icon} size={19} />
            </span>
            <div className="grow-main">
              <b>{r.label}</b>
              <span>{r.sub}</span>
            </div>
            <Icon name="chevronRight" size={16} className="chev" />
          </button>
        ))}
      </div>

      <div className="version">
        MG&amp;CO FIELD · v0.2
        <span>Everything saves on this device automatically — works with no signal.</span>
      </div>
    </div>
  );
}
