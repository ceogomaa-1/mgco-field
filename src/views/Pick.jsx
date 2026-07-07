import { useState } from "react";
import { uid } from "../util";
import { TopBar, Field } from "../ui";
import { Icon } from "../icons";

export default function Pick({ db, update, go, ctx }) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(db.customers.length === 0);
  const [form, setForm] = useState({ name: "", phone: "", address: "", email: "" });

  const start = (customerId) => {
    const job = {
      id: uid(),
      customerId,
      workerUserId: ctx?.me?.userId || null,
      startedAt: Date.now(),
      finishedAt: null,
      scheduledFor: null,
      breaks: [],
      materials: [],
      photos: [],
      notes: "",
      measurementNotes: [],
      rate: Number(db.settings.rate) || 0,
      taxRate: Number(db.settings.taxRate) || 0,
      status: "active",
      rev: 1,
    };
    update((d) => d.jobs.push(job));
    go("job", { id: job.id });
  };

  const createAndStart = () => {
    if (!form.name.trim()) return;
    const c = { id: uid(), ...form, name: form.name.trim(), createdAt: Date.now() };
    update((d) => d.customers.push(c));
    start(c.id);
  };

  const list = db.customers
    .filter((c) => `${c.name} ${c.phone || ""} ${c.address || ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page">
      <TopBar title="Who's the job for?" onBack={() => go("home")} />

      {!creating ? (
        <>
          <button className="btn big secondary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} /> New customer
          </button>
          <input
            className="search"
            placeholder="Search customers…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="group">
            {list.map((c) => (
              <button key={c.id} className="grow tappable" onClick={() => start(c.id)}>
                <div className="grow-main">
                  <b>{c.name}</b>
                  <span>{[c.phone, c.address].filter(Boolean).join(" • ") || "No details yet"}</span>
                </div>
                <Icon name="play" size={16} className="accent" />
              </button>
            ))}
            {list.length === 0 && <div className="grow"><span className="dim">No matches.</span></div>}
          </div>
        </>
      ) : (
        <div className="card form">
          <Field
            label="Name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="John Carter"
            autoFocus
          />
          <Field
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="(555) 123-4567"
            hint="Used to text them the report"
          />
          <Field
            label="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="123 Main St"
          />
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="john@email.com"
            hint="Used to email them the report"
          />
          <button className="btn big primary" disabled={!form.name.trim()} onClick={createAndStart}>
            START JOB
          </button>
          {db.customers.length > 0 && (
            <button className="btn big ghost" onClick={() => setCreating(false)}>
              Back to customer list
            </button>
          )}
        </div>
      )}
    </div>
  );
}
