// Local-first cloud sync.
// The app keeps working offline exactly as before; this engine pushes dirty
// entities (tracked by per-job `rev` counters) to Supabase in the background
// and pulls company data on load / focus / realtime pokes. RLS on the server
// guarantees employees only ever receive their own jobs.
import { supa } from "./supa";

const isoOrNull = (ts) => (ts ? new Date(ts).toISOString() : null);
const msOrNull = (iso) => (iso ? new Date(iso).getTime() : null);

export function jobToRow(j, companyId) {
  return {
    id: j.id,
    company_id: companyId,
    customer_id: j.customerId || null,
    worker_user_id: j.workerUserId || null,
    status: j.status,
    scheduled_for: isoOrNull(j.scheduledFor),
    schedule_note: j.scheduleNote || "",
    started_at: isoOrNull(j.startedAt),
    finished_at: isoOrNull(j.finishedAt),
    breaks: j.breaks || [],
    materials: j.materials || [],
    photos: j.photos || [],
    notes: j.notes || "",
    rate: j.rate || 0,
    tax_rate: j.taxRate || 0,
    rev: j.rev || 0,
  };
}

export function rowToJob(r) {
  return {
    id: r.id,
    customerId: r.customer_id,
    workerUserId: r.worker_user_id,
    status: r.status,
    scheduledFor: msOrNull(r.scheduled_for),
    scheduleNote: r.schedule_note || "",
    startedAt: msOrNull(r.started_at),
    finishedAt: msOrNull(r.finished_at),
    breaks: r.breaks || [],
    materials: r.materials || [],
    photos: r.photos || [],
    notes: r.notes || "",
    rate: Number(r.rate) || 0,
    taxRate: Number(r.tax_rate) || 0,
    rev: Number(r.rev) || 0,
  };
}

/* ---------- per-user sync bookkeeping ---------- */

function syncKey(uid) {
  return `mgco-field-sync:${uid}`;
}

function loadState(uid) {
  try {
    return JSON.parse(localStorage.getItem(syncKey(uid))) || {};
  } catch {
    return {};
  }
}

function saveState(uid, s) {
  try {
    localStorage.setItem(syncKey(uid), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/* ---------- push (outbox) ---------- */

export async function pushChanges(db, ctx) {
  if (!ctx?.company?.id || !navigator.onLine) return;
  const uid = ctx.me.userId;
  const s = loadState(uid);
  s.jobRevs = s.jobRevs || {};
  s.customerIds = s.customerIds || [];

  try {
    // deletions first
    for (const id of db.deletedIds || []) {
      await supa.from("jobs").delete().eq("id", id);
      delete s.jobRevs[id];
    }

    // new customers
    const newCustomers = db.customers.filter((c) => !s.customerIds.includes(c.id));
    if (newCustomers.length) {
      const { error } = await supa.from("customers").upsert(
        newCustomers.map((c) => ({
          id: c.id,
          company_id: ctx.company.id,
          name: c.name || "",
          phone: c.phone || "",
          email: c.email || "",
          address: c.address || "",
        }))
      );
      if (!error) s.customerIds.push(...newCustomers.map((c) => c.id));
    }

    // dirty jobs (rev-based)
    const dirty = db.jobs.filter((j) => (j.rev || 0) > (s.jobRevs[j.id] ?? -1));
    for (const j of dirty) {
      const { error } = await supa.from("jobs").upsert(jobToRow(j, ctx.company.id));
      if (!error) s.jobRevs[j.id] = j.rev || 0;
    }

    // favorites
    if ((db.favRev || 0) > (s.favRev ?? -1) && db.favorites.length) {
      const { error } = await supa.from("favorites").upsert(
        db.favorites.map((f) => ({
          company_id: ctx.company.id,
          name: f.name,
          price: f.price || 0,
          uses: f.uses || 1,
        }))
      );
      if (!error) s.favRev = db.favRev || 0;
    }

    // branding/settings (owner only)
    if (ctx.role === "owner" && (db.settingsRev || 0) > (s.settingsRev ?? -1)) {
      const { error } = await supa
        .from("companies")
        .update({
          name: db.settings.company || "",
          settings: db.settings,
          settings_rev: db.settingsRev || 0,
        })
        .eq("id", ctx.company.id);
      if (!error) s.settingsRev = db.settingsRev || 0;
    }

    saveState(uid, s);
    return { pushedJobs: dirty.length, deleted: (db.deletedIds || []).length };
  } catch (e) {
    console.warn("sync push failed (will retry)", e);
  }
}

/* ---------- pull + merge ---------- */

export async function pullAll(ctx) {
  const [jobsRes, custRes, favRes, compRes] = await Promise.all([
    supa.from("jobs").select("*"),
    supa.from("customers").select("*"),
    supa.from("favorites").select("*"),
    supa.from("companies").select("name, settings, settings_rev").eq("id", ctx.company.id).maybeSingle(),
  ]);
  return {
    jobs: (jobsRes.data || []).map(rowToJob),
    customers: (custRes.data || []).map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      createdAt: msOrNull(r.created_at) || Date.now(),
    })),
    favorites: (favRes.data || []).map((r) => ({
      name: r.name,
      price: Number(r.price) || 0,
      uses: r.uses || 1,
    })),
    company: compRes.data || null,
  };
}

/** Merge pulled cloud state into the local db (higher job rev wins; local ties win). */
export function mergePulled(d, pulled, ctx) {
  const deleted = new Set(d.deletedIds || []);

  const byId = new Map(d.jobs.map((j) => [j.id, j]));
  for (const rj of pulled.jobs) {
    if (deleted.has(rj.id)) continue;
    const local = byId.get(rj.id);
    if (!local) {
      d.jobs.push(rj);
    } else if ((rj.rev || 0) > (local.rev || 0)) {
      Object.assign(local, rj);
    }
  }

  const knownCust = new Set(d.customers.map((c) => c.id));
  for (const c of pulled.customers) if (!knownCust.has(c.id)) d.customers.push(c);

  const favByName = new Map(d.favorites.map((f) => [f.name.toLowerCase(), f]));
  for (const f of pulled.favorites) {
    const local = favByName.get(f.name.toLowerCase());
    if (!local) d.favorites.push(f);
    else local.uses = Math.max(local.uses || 1, f.uses || 1);
  }

  // company branding/settings — for employees the server is authoritative
  if (pulled.company) {
    const remoteRev = Number(pulled.company.settings_rev) || 0;
    if (ctx.role !== "owner" || remoteRev > (d.settingsRev || 0)) {
      d.settings = { ...d.settings, ...(pulled.company.settings || {}) };
      d.settingsRev = remoteRev;
    }
  }
}

/* ---------- team ---------- */

export async function fetchTeam(ctx) {
  const { data: members } = await supa
    .from("members")
    .select("user_id, name, email, wage, role");
  let invites = [];
  if (ctx.role === "owner") {
    const { data } = await supa
      .from("invites")
      .select("id, email, accepted_at, created_at")
      .is("accepted_at", null);
    invites = data || [];
  }
  return {
    team: (members || []).map((m) => ({
      userId: m.user_id,
      name: m.name,
      email: m.email,
      wage: Number(m.wage) || 0,
      role: m.role,
    })),
    invites,
  };
}

/* ---------- realtime ---------- */

export function subscribeJobs(onPoke) {
  // Unique name per call so an overlapping subscribe/unsubscribe pair (e.g. a
  // fast remount) can never collide on the same realtime topic.
  const channel = supa
    .channel(`jobs-live-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, onPoke)
    .subscribe();
  return () => supa.removeChannel(channel);
}
