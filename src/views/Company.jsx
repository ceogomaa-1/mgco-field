import { useRef } from "react";
import { compressImage } from "../util";
import { TopBar, Field } from "../ui";
import { Icon } from "../icons";

const PRESETS = [
  { name: "Amber", value: "#f2a71b" },
  { name: "Blue", value: "#0a84ff" },
  { name: "Green", value: "#30d158" },
  { name: "Red", value: "#ff453a" },
  { name: "Purple", value: "#bf5af2" },
  { name: "Sky", value: "#5ac8fa" },
  { name: "Teal", value: "#2dd4bf" },
  { name: "Pink", value: "#ff375f" },
];

export default function Company({ db, update, go }) {
  const s = db.settings;
  const logoRef = useRef(null);
  const bannerRef = useRef(null);
  const bump = (d) => (d.settingsRev = (d.settingsRev || 0) + 1);
  const set = (key, value) =>
    update((d) => {
      d.settings[key] = value;
      bump(d);
    });
  const accent = (s.theme?.accent || "#f2a71b").toLowerCase();
  const setAccent = (c) =>
    update((d) => {
      d.settings.theme = { ...(d.settings.theme || {}), accent: c };
      bump(d);
    });

  const onLogo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      set("logo", await compressImage(f, 320, 0.85));
    } catch (err) {
      console.warn(err);
    }
  };

  const onBanner = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      set("banner", await compressImage(f, 1400, 0.72));
    } catch (err) {
      console.warn(err);
    }
  };

  return (
    <div className="page">
      <TopBar title="Brand & appearance" onBack={() => go("more")} />

      <h2>Your brand — shown in the app & on every report</h2>
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

        <div className="field">
          <span>Banner photo (optional)</span>
          {s.banner ? (
            <div className="banner-preview">
              <img src={s.banner} alt="banner" />
              <div className="banner-btns">
                <button className="btn secondary" onClick={() => bannerRef.current?.click()}>
                  Change
                </button>
                <button className="btn ghost" onClick={() => set("banner", null)}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button className="banner-add" onClick={() => bannerRef.current?.click()}>
              <Icon name="camera" size={20} />
              Add a banner photo
            </button>
          )}
          <input ref={bannerRef} type="file" accept="image/*" hidden onChange={onBanner} />
        </div>

        <Field label="Company name" value={s.company} onChange={(e) => set("company", e.target.value)} placeholder="Your Company Ltd." />
        <Field label="Phone" type="tel" value={s.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" />
        <Field label="Email" type="email" value={s.email} onChange={(e) => set("email", e.target.value)} placeholder="you@company.com" />
      </div>

      <h2>Appearance — this is what your crew sees too</h2>
      <div className="card form">
        <label className="mini-label">ACCENT COLOR</label>
        <div className="swatches">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              className={"swatch" + (accent === p.value ? " sel" : "")}
              style={{ background: p.value }}
              onClick={() => setAccent(p.value)}
              aria-label={p.name}
            >
              {accent === p.value && <Icon name="check" size={15} />}
            </button>
          ))}
          <label className="swatch custom" style={{ background: accent }} aria-label="Custom color">
            <Icon name="plus" size={15} />
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
          </label>
        </div>
        <small className="hint">Recolors the whole app and your reports — instantly.</small>
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
