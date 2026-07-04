import { useRef } from "react";
import { compressImage } from "../util";
import { TopBar, Field } from "../ui";

export default function Company({ db, update, go }) {
  const s = db.settings;
  const logoRef = useRef(null);
  const set = (key, value) => update((d) => (d.settings[key] = value));

  const onLogo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const data = await compressImage(f, 300, 0.8);
      set("logo", data);
    } catch (err) {
      console.warn(err);
    }
  };

  return (
    <div className="page">
      <TopBar title="Company & billing" onBack={() => go("more")} />

      <h2>Shows on every customer report</h2>
      <div className="card form">
        <div className="logo-row">
          {s.logo ? (
            <img src={s.logo} alt="logo" className="logo-preview" />
          ) : (
            <div className="logo-preview empty-logo">Logo</div>
          )}
          <div className="logo-btns">
            <button className="btn secondary" onClick={() => logoRef.current?.click()}>
              {s.logo ? "Change logo" : "Add logo"}
            </button>
            {s.logo && (
              <button className="btn ghost" onClick={() => set("logo", null)}>
                Remove
              </button>
            )}
          </div>
          <input ref={logoRef} type="file" accept="image/*" hidden onChange={onLogo} />
        </div>
        <Field label="Company name" value={s.company} onChange={(e) => set("company", e.target.value)} />
        <Field label="Phone" type="tel" value={s.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" />
        <Field label="Email" type="email" value={s.email} onChange={(e) => set("email", e.target.value)} placeholder="you@company.com" />
      </div>

      <h2>Billing defaults — adjustable per job at finish</h2>
      <div className="card form">
        <div className="two-col">
          <Field
            label={`Hourly rate (${s.currency})`}
            type="number"
            inputMode="decimal"
            min="0"
            value={s.rate}
            onChange={(e) => set("rate", Number(e.target.value) || 0)}
          />
          <Field
            label="Tax %"
            type="number"
            inputMode="decimal"
            min="0"
            value={s.taxRate}
            onChange={(e) => set("taxRate", Number(e.target.value) || 0)}
          />
        </div>
        <Field label="Currency symbol" value={s.currency} onChange={(e) => set("currency", e.target.value || "$")} />
      </div>
    </div>
  );
}
