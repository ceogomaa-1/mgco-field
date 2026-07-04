export const uid = () => crypto.randomUUID();

/* ---------- time math (timestamp-based: survives refresh, phone lock, app close) ---------- */

export function workedMs(job, now = Date.now()) {
  if (!job.startedAt) return 0; // scheduled, not started yet
  const end = job.finishedAt || now;
  let breaks = 0;
  for (const b of job.breaks) breaks += (b.end || end) - b.start;
  return Math.max(0, end - job.startedAt - breaks);
}

export function breakMs(job, now = Date.now()) {
  if (!job.startedAt) return 0;
  const end = job.finishedAt || now;
  let t = 0;
  for (const b of job.breaks) t += (b.end || end) - b.start;
  return t;
}

export const onBreak = (job) =>
  !job.finishedAt && job.breaks.length > 0 && !job.breaks[job.breaks.length - 1].end;

export function jobTotals(job, now = Date.now()) {
  const hrs = workedMs(job, now) / 3600000;
  const labor = hrs * (job.rate || 0);
  const mats = job.materials.reduce((s, m) => s + m.qty * m.price, 0);
  const sub = labor + mats;
  const tax = sub * ((job.taxRate || 0) / 100);
  return { hrs, labor, mats, sub, tax, total: sub + tax };
}

/* ---------- weeks (payroll) ---------- */

export const WEEK_MS = 7 * 86400000;

export function weekStart(ts = Date.now()) {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function fmtWeekRange(ws) {
  const a = new Date(ws);
  const b = new Date(ws + WEEK_MS - 1);
  const f = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${f(a)} – ${f(b)}`;
}

/* ---------- formatting ---------- */

export const money = (n, cur = "$") => cur + (Math.round(n * 100) / 100).toFixed(2);

export function fmtTimer(ms) {
  const s = Math.floor(ms / 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function fmtDur(ms) {
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

export const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export const fmtDayLabel = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

export function isToday(ts) {
  const d = new Date(ts), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export const dayStart = (ts = Date.now()) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ---------- photos ---------- */

export async function compressImage(file, maxDim = 1000, quality = 0.65) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function dataURLtoFile(dataURL, name) {
  const [head, b64] = dataURL.split(",");
  const mime = head.match(/data:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

/* ---------- customer report (plain text for SMS / email / copy) ---------- */

export function buildReportText(job, customer, settings, worker) {
  const t = jobTotals(job);
  const cur = settings.currency || "$";
  const L = [];
  L.push(`${settings.company || "Job Report"} — Job Report`);
  L.push(`Customer: ${customer?.name || "—"}`);
  if (customer?.address) L.push(`Address: ${customer.address}`);
  L.push(`Date: ${fmtDate(job.startedAt || Date.now())}`);
  if (worker?.name) L.push(`Technician: ${worker.name}`);
  L.push(
    `On site: ${fmtTime(job.startedAt)} – ${fmtTime(job.finishedAt || Date.now())} (${fmtDur(workedMs(job))} worked)`
  );
  L.push("");
  if (job.notes) {
    L.push("WORK PERFORMED:");
    L.push(job.notes);
    L.push("");
  }
  if (job.materials.length) {
    L.push("MATERIALS:");
    for (const m of job.materials) L.push(`• ${m.name} x${m.qty} — ${money(m.qty * m.price, cur)}`);
    L.push("");
  }
  L.push(`Labor: ${t.hrs.toFixed(2)}h × ${money(job.rate || 0, cur)}/h = ${money(t.labor, cur)}`);
  if (t.mats > 0) L.push(`Materials: ${money(t.mats, cur)}`);
  if (t.tax > 0) L.push(`Tax (${job.taxRate}%): ${money(t.tax, cur)}`);
  L.push(`TOTAL: ${money(t.total, cur)}`);
  L.push("");
  L.push("Thank you for your business!");
  const contact = [settings.phone, settings.email].filter(Boolean).join(" • ");
  L.push(`— ${settings.company || ""}${contact ? " • " + contact : ""}`);
  return L.join("\n");
}
