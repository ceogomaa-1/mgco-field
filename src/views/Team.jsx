import { useState } from "react";
import { uid, money } from "../util";
import { TopBar } from "../ui";
import { Icon } from "../icons";

export default function Team({ db, update, go }) {
  const [name, setName] = useState("");
  const [wage, setWage] = useState("");
  const cur = db.settings.currency;

  const add = () => {
    if (!name.trim()) return;
    update((d) => d.workers.push({ id: uid(), name: name.trim(), wage: Number(wage) || 0 }));
    setName("");
    setWage("");
  };

  const remove = (id) => {
    if (confirm("Remove this worker? Their past hours stay on the jobs.")) {
      update((d) => (d.workers = d.workers.filter((w) => w.id !== id)));
    }
  };

  return (
    <div className="page">
      <TopBar title="Team" onBack={() => go("more")} />

      <div className="card form">
        <label className="mini-label">ADD A WORKER</label>
        <div className="mat-row team-row">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            type="number"
            inputMode="decimal"
            min="0"
            placeholder={`Pay ${cur}/h`}
            value={wage}
            onChange={(e) => setWage(e.target.value)}
          />
          <button className="btn primary add" disabled={!name.trim()} onClick={add}>
            ADD
          </button>
        </div>
        <small className="hint">
          Pick who's working when you start or schedule a job — their hours land in Payroll automatically.
        </small>
      </div>

      {db.workers.length > 0 && (
        <div className="group">
          {db.workers.map((w) => (
            <div key={w.id} className="grow">
              <div className="grow-main">
                <b>{w.name}</b>
                <span>{w.wage ? `${money(w.wage, cur)}/h` : "No wage set"}</span>
              </div>
              <button className="icon-btn" onClick={() => remove(w.id)}>
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
