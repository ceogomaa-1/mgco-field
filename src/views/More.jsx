import { useState } from "react";
import { supa } from "../supa";
import { Icon } from "../icons";
import { toast } from "../ui";

export default function More({ db, update, go, ctx, signOut }) {
  const isOwner = ctx?.role === "owner";

  const rows = isOwner
    ? [
        { icon: "dollar", label: "Payroll", sub: "Hours & pay across your team", view: "payroll" },
        { icon: "briefcase", label: "Brand & appearance", sub: "Logo, banner, colors, billing", view: "company" },
        { icon: "sparkle", label: "AI Assistant", sub: "Voice notes & receipt scanning", view: "assistant" },
      ]
    : [{ icon: "dollar", label: "My hours", sub: "Your time & jobs, week by week", view: "payroll" }];

  return (
    <div className="page">
      <header className="brand">
        <div className="page-title">More</div>
      </header>

      {db.settings.company && (
        <div className="company-badge">
          {db.settings.logo && <img src={db.settings.logo} alt="" />}
          <div>
            <b>{db.settings.company}</b>
            <span>{isOwner ? "You own this workspace" : "You're on the crew"}</span>
          </div>
        </div>
      )}

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

      <h2>Account</h2>
      <div className="card form">
        {!isOwner && <ProfileName ctx={ctx} />}
        <div className="acct-email">
          <div>
            <span>Signed in as</span>
            <b>{ctx?.me?.email || "—"}</b>
          </div>
          <span className={"role-tag " + (isOwner ? "owner" : "")}>
            {isOwner ? "Owner" : "Employee"}
          </span>
        </div>
        <button className="btn big ghost" onClick={signOut}>
          Sign out
        </button>
      </div>

      <div className="version">
        {db.settings.company || "FIELD"} · v0.4
        <span>Your work syncs to the cloud and stays available offline.</span>
      </div>
    </div>
  );
}

function ProfileName({ ctx }) {
  const [name, setName] = useState(ctx?.me?.name || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const { error } = await supa.rpc("set_my_name", { new_name: name.trim() });
    setBusy(false);
    if (error) return toast(error.message);
    ctx.me.name = name.trim();
    toast("Name saved");
  };

  return (
    <label className="field">
      <span>Your display name — shown to your boss & on reports you run</span>
      <div className="inline-save">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        <button className="btn primary" disabled={busy || !name.trim() || name.trim() === ctx?.me?.name} onClick={save}>
          Save
        </button>
      </div>
    </label>
  );
}
