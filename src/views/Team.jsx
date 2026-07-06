import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { supa } from "../supa";
import { SUPABASE_URL } from "../config";
import { workedMs, jobTotals, fmtTimer, fmtDur, money, weekStart, WEEK_MS, onBreak } from "../util";
import { Sheet, toast } from "../ui";
import { Icon } from "../icons";

export default function Team({ db, go, ctx, team, invites, refreshTeam }) {
  const [sheet, setSheet] = useState(null); // 'invite' | {member}
  const [, tick] = useState(0);
  const cur = db.settings.currency;

  const liveJobs = db.jobs.filter((j) => j.status === "active");
  useEffect(() => {
    if (!liveJobs.length) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [liveJobs.length]);

  const ws = weekStart();
  const weekJobs = db.jobs.filter((j) => j.startedAt && j.startedAt >= ws && j.startedAt < ws + WEEK_MS);

  const statsFor = (userId) => {
    const mine = weekJobs.filter((j) => j.workerUserId === userId);
    return {
      ms: mine.reduce((s, j) => s + workedMs(j), 0),
      jobs: mine.length,
      billed: mine.filter((j) => j.status === "done").reduce((s, j) => s + jobTotals(j).total, 0),
    };
  };

  const cname = (id) => db.customers.find((c) => c.id === id)?.name || "Customer";
  const memberName = (userId) =>
    team.find((t) => t.userId === userId)?.name || (userId === ctx.me.userId ? "You" : "—");

  const revokeInvite = async (id) => {
    await supa.from("invites").delete().eq("id", id);
    refreshTeam();
  };

  return (
    <div className="page">
      <header className="brand">
        <div className="page-title">Team</div>
        <button className="btn small primary" onClick={() => setSheet("invite")}>
          <Icon name="plus" size={15} /> Invite
        </button>
      </header>

      {liveJobs.length > 0 && (
        <>
          <h2>On the clock right now</h2>
          <div className="group">
            {liveJobs.map((j) => (
              <div key={j.id} className="grow">
                <span className={"pulse-dot" + (onBreak(j) ? " hold" : "")} />
                <div className="grow-main">
                  <b>{memberName(j.workerUserId)}</b>
                  <span>
                    {cname(j.customerId)}
                    {onBreak(j) ? " • on break" : ""}
                  </span>
                </div>
                <b className="live-timer">{fmtTimer(workedMs(j))}</b>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>This week</h2>
      <div className="group">
        {team.map((m) => {
          const s = statsFor(m.userId);
          const isMe = m.userId === ctx.me.userId;
          return (
            <button key={m.userId} className="grow tappable" onClick={() => !isMe && setSheet({ member: m })}>
              <span className="row-ic">
                <Icon name={m.role === "owner" ? "briefcase" : "users"} size={19} />
              </span>
              <div className="grow-main">
                <b>
                  {m.name}
                  {isMe ? " (you)" : ""}
                </b>
                <span>
                  {fmtDur(s.ms)} • {s.jobs} job{s.jobs !== 1 ? "s" : ""} • billed {money(s.billed, cur)}
                </span>
              </div>
              <div className="grow-side">
                {m.role === "employee" && (
                  <span className="dim">{m.wage ? `${money(m.wage, cur)}/h` : "set wage"}</span>
                )}
                {!isMe && <Icon name="chevronRight" size={16} className="chev" />}
              </div>
            </button>
          );
        })}
      </div>

      {invites.length > 0 && (
        <>
          <h2>Invited — waiting to join</h2>
          <div className="group">
            {invites.map((inv) => (
              <div key={inv.id} className="grow">
                <span className="row-ic"><Icon name="mail" size={19} /></span>
                <div className="grow-main">
                  <b>{inv.email}</b>
                  <span>They sign in with this email and land right in your company</span>
                </div>
                <button className="icon-btn" onClick={() => revokeInvite(inv.id)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {team.length <= 1 && invites.length === 0 && (
        <div className="empty">
          <Icon name="users" size={26} />
          <p>
            Just you so far. Tap <b>Invite</b>, drop in your crew's emails, and each of them gets
            their own clock, jobs and hours — while you see everything here.
          </p>
        </div>
      )}

      <AnimatePresence>
        {sheet === "invite" && (
          <Sheet key="inv" title="Invite your team" onClose={() => setSheet(null)}>
            <InviteForm refreshTeam={refreshTeam} onClose={() => setSheet(null)} />
          </Sheet>
        )}
        {sheet?.member && (
          <Sheet key="mem" title={sheet.member.name} onClose={() => setSheet(null)}>
            <MemberEditor member={sheet.member} cur={cur} refreshTeam={refreshTeam} onClose={() => setSheet(null)} />
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- invite form ---------------- */

function InviteForm({ refreshTeam, onClose }) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState(null);

  const send = async () => {
    setBusy(true);
    try {
      const emails = raw.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
      const { data: sess } = await supa.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session?.access_token}`,
        },
        body: JSON.stringify({ emails }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Invite failed");
      const entries = Object.entries(data.results || {});
      const emailed = entries.filter(([, r]) => r.emailed).length;
      const manual = entries.filter(([, r]) => r.invited && !r.emailed && r.link);
      if (emailed) toast(`✓ ${emailed} invite email${emailed > 1 ? "s" : ""} sent`);
      if (manual.length) {
        setLinks(manual.map(([email, r]) => ({ email, link: r.link })));
      } else {
        onClose();
      }
      refreshTeam();
    } catch (e) {
      toast(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (links) {
    return (
      <div className="stack">
        <small className="hint">
          These already had accounts (or email is rate-limited) — text them their sign-in link
          instead:
        </small>
        {links.map(({ email, link }) => (
          <button
            key={email}
            className="btn big secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              toast(`Link for ${email} copied`);
            }}
          >
            <Icon name="copy" size={16} /> {email}
          </button>
        ))}
        <button className="btn big primary" onClick={onClose}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="stack">
      <textarea
        className="notes"
        rows={4}
        placeholder={"One email per line:\nmike@gmail.com\njose@gmail.com"}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <button className="btn big primary" disabled={busy || !raw.trim()} onClick={send}>
        {busy ? "Sending…" : "SEND INVITES"}
      </button>
      <small className="hint">
        Each person gets an email invite. They sign in with that email (password or Google) and
        land straight in your company — with your branding, and only their own jobs.
      </small>
    </div>
  );
}

/* ---------------- member editor (wage / remove) ---------------- */

function MemberEditor({ member, cur, refreshTeam, onClose }) {
  const [wage, setWage] = useState(member.wage || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const { error } = await supa
      .from("members")
      .update({ wage: Number(wage) || 0 })
      .eq("user_id", member.userId);
    setBusy(false);
    if (error) return toast(error.message);
    toast("Saved");
    refreshTeam();
    onClose();
  };

  const remove = async () => {
    if (!confirm(`Remove ${member.name} from your company? Their past jobs stay on record.`)) return;
    const { error } = await supa.from("members").delete().eq("user_id", member.userId);
    if (error) return toast(error.message);
    toast(`${member.name} removed`);
    refreshTeam();
    onClose();
  };

  return (
    <div className="stack">
      <label className="field">
        <span>Hourly wage ({cur}/h) — drives their payroll line</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={wage}
          onChange={(e) => setWage(e.target.value)}
          placeholder="e.g. 35"
        />
      </label>
      <button className="btn big primary" disabled={busy} onClick={save}>
        Save
      </button>
      <button className="link-danger" onClick={remove}>
        Remove from company
      </button>
    </div>
  );
}
