import { useState } from "react";
import { uid } from "../util";
import { TopBar, Field } from "../ui";

function defaultDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultTime() {
  const d = new Date();
  const h = Math.min(d.getHours() + 1, 23);
  return `${String(h).padStart(2, "0")}:00`;
}

export default function ScheduleNew({ db, update, go, ctx, team }) {
  const [customerId, setCustomerId] = useState(db.customers[0]?.id || "new");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState(defaultTime());
  const [note, setNote] = useState("");
  const [workerUserId, setWorkerUserId] = useState(ctx?.me?.userId || "");

  const isNew = customerId === "new";
  const valid = date && time && (!isNew || newName.trim());
  const assignable = ctx?.role === "owner" && team.length > 1;

  const save = () => {
    if (!valid) return;
    const when = new Date(`${date}T${time}`).getTime();
    update((d) => {
      let cid = customerId;
      if (isNew) {
        const c = { id: uid(), name: newName.trim(), phone: newPhone, address: "", email: "", createdAt: Date.now() };
        d.customers.push(c);
        cid = c.id;
      }
      d.jobs.push({
        id: uid(),
        customerId: cid,
        workerUserId: workerUserId || ctx?.me?.userId || null,
        status: "scheduled",
        scheduledFor: when,
        scheduleNote: note.trim(),
        startedAt: null,
        finishedAt: null,
        breaks: [],
        materials: [],
        photos: [],
        notes: "",
        measurementNotes: [],
        rate: Number(d.settings.rate) || 0,
        taxRate: Number(d.settings.taxRate) || 0,
        rev: 1,
      });
    });
    go("schedule");
  };

  const sorted = [...db.customers].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page">
      <TopBar title="Schedule a job" onBack={() => go("schedule")} />

      <div className="card form">
        <label className="field">
          <span>Customer</span>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {sorted.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="new">＋ New customer…</option>
          </select>
        </label>

        {isNew && (
          <>
            <Field label="Name *" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="John Carter" />
            <Field label="Phone" type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="(555) 123-4567" />
          </>
        )}

        <div className="two-col">
          <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Field label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>

        {assignable && (
          <label className="field">
            <span>Assigned to</span>
            <select value={workerUserId} onChange={(e) => setWorkerUserId(e.target.value)}>
              {team.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.userId === ctx.me.userId ? `${m.name} (you)` : m.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <Field
          label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Water heater replacement — bring the 40gal"
        />

        <button className="btn big primary" disabled={!valid} onClick={save}>
          SCHEDULE JOB
        </button>
      </div>
    </div>
  );
}
