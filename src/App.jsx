import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDb } from "./db";
import { supa, urlAuthType } from "./supa";
import { pushChanges, pullAll, mergePulled, fetchTeam, subscribeJobs } from "./sync";
import { Icon } from "./icons";
import { Toaster } from "./ui";
import { themeVars } from "./util";
import { AuthScreen, DeniedScreen, SetPasswordScreen, LoadingScreen } from "./views/Auth";
import Home from "./views/Home";
import Pick from "./views/Pick";
import Job from "./views/Job";
import Finish from "./views/Finish";
import Report from "./views/Report";
import Customers from "./views/Customers";
import Schedule from "./views/Schedule";
import ScheduleNew from "./views/ScheduleNew";
import Team from "./views/Team";
import More from "./views/More";
import Company from "./views/Company";
import Payroll from "./views/Payroll";
import Assistant from "./views/Assistant";
import MeasureEditor from "./views/MeasureEditor";

const OWNER_TABS = [
  { key: "home", label: "Today", icon: "clock" },
  { key: "team", label: "Team", icon: "users" },
  { key: "schedule", label: "Schedule", icon: "calendar" },
  { key: "customers", label: "Customers", icon: "briefcase" },
  { key: "more", label: "More", icon: "grid" },
];
const EMPLOYEE_TABS = [
  { key: "home", label: "Today", icon: "clock" },
  { key: "schedule", label: "Schedule", icon: "calendar" },
  { key: "customers", label: "Customers", icon: "users" },
  { key: "more", label: "More", icon: "grid" },
];

const ctxKey = (uid) => `mgco-field-ctx:${uid}`;

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [ctx, setCtx] = useState(null); // { role, me, company }
  const [gate, setGate] = useState("loading"); // loading | signedout | denied | setpw | ready
  const [deniedEmail, setDeniedEmail] = useState("");
  const [team, setTeam] = useState([]);
  const [invites, setInvites] = useState([]);
  const [view, setView] = useState({ name: "home" });
  const needsPw = useRef(urlAuthType === "invite" || urlAuthType === "recovery");

  const uid = session?.user?.id;
  const storageKey = uid ? `mgco-field-v1:${uid}` : "mgco-field-v1:anon";
  const [db, update] = useDb(storageKey);

  const dbRef = useRef(db);
  dbRef.current = db;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  /* ---------- auth lifecycle ---------- */

  useEffect(() => {
    supa.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supa.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshTeam = useCallback(async (c = ctxRef.current) => {
    if (!c) return;
    try {
      const t = await fetchTeam(c);
      setTeam(t.team);
      setInvites(t.invites);
    } catch (e) {
      console.warn("team fetch failed", e);
    }
  }, []);

  const pullNow = useCallback(async (c = ctxRef.current) => {
    if (!c || !navigator.onLine) return;
    try {
      const pulled = await pullAll(c);
      update((d) => mergePulled(d, pulled, c));
    } catch (e) {
      console.warn("pull failed", e);
    }
  }, [update]);

  const runBootstrap = useCallback(async (s) => {
    const user = s?.user;
    if (!user) return;
    try {
      const displayName =
        user.user_metadata?.full_name || user.user_metadata?.name || null;
      const { data, error } = await supa.rpc("bootstrap", { display_name: displayName });
      if (error) throw error;
      if (data.state === "member") {
        const c = { role: data.role, me: data.me, company: data.company };
        setCtx(c);
        localStorage.setItem(ctxKey(user.id), JSON.stringify(c));
        // hydrate branding — for employees the company's settings are authoritative
        update((d) => {
          const remoteRev = Number(data.company.settings_rev) || 0;
          if (c.role !== "owner" || remoteRev > (d.settingsRev || 0)) {
            d.settings = { ...d.settings, ...(data.company.settings || {}) };
            d.settingsRev = remoteRev;
          }
        });
        setGate(needsPw.current ? "setpw" : "ready");
        pullNow(c);
        refreshTeam(c);
      } else {
        setDeniedEmail(data.email || user.email || "");
        setGate("denied");
      }
    } catch (e) {
      // offline with a cached membership → let them work; sync catches up later
      console.warn("bootstrap failed", e);
      try {
        const cached = JSON.parse(localStorage.getItem(ctxKey(user.id)));
        if (cached?.company?.id) {
          setCtx(cached);
          setGate("ready");
          return;
        }
      } catch { /* ignore */ }
      setDeniedEmail(user.email || "");
      setGate("denied");
    }
  }, [update, pullNow, refreshTeam]);

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) {
      setCtx(null);
      setGate("signedout");
      return;
    }
    if (!ctxRef.current || ctxRef.current.me?.userId !== session.user.id) {
      setGate("loading");
      runBootstrap(session);
    }
  }, [session, runBootstrap]);

  /* ---------- background sync ---------- */

  // push: any local change → debounce → upload dirty entities
  useEffect(() => {
    if (gate !== "ready" || !ctx) return;
    const t = setTimeout(async () => {
      const res = await pushChanges(dbRef.current, ctxRef.current);
      if (res && dbRef.current.deletedIds?.length) {
        update((d) => (d.deletedIds = []));
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [db, gate, ctx, update]);

  // pull: on interval, on focus, and when realtime pokes us
  useEffect(() => {
    if (gate !== "ready" || !ctx) return;
    const interval = setInterval(() => pullNow(), 60000);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        pullNow();
        refreshTeam();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    let poke;
    const unsub = subscribeJobs(() => {
      clearTimeout(poke);
      poke = setTimeout(() => pullNow(), 800);
    });
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      clearTimeout(poke);
      unsub();
    };
  }, [gate, ctx, pullNow, refreshTeam]);

  /* ---------- routing ---------- */

  const go = (name, params = {}) => {
    setView({ name, ...params });
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    document.title = db.settings.company || "Field";
  }, [db.settings.company]);

  const signOut = async () => {
    await supa.auth.signOut();
    setView({ name: "home" });
  };

  /* ---------- gates ---------- */

  const theme = themeVars(db.settings.theme?.accent);

  if (gate === "loading" || session === undefined) {
    return (
      <div className="app" style={theme}>
        <LoadingScreen />
      </div>
    );
  }
  if (gate === "signedout") {
    return (
      <div className="app" style={theme}>
        <AuthScreen />
      </div>
    );
  }
  if (gate === "denied") {
    return (
      <div className="app" style={theme}>
        <DeniedScreen
          email={deniedEmail}
          onRetry={() => runBootstrap(session)}
          onSignOut={signOut}
        />
      </div>
    );
  }
  if (gate === "setpw") {
    return (
      <div className="app" style={theme}>
        <SetPasswordScreen
          onDone={() => {
            needsPw.current = false;
            setGate("ready");
          }}
        />
      </div>
    );
  }

  /* ---------- the app ---------- */

  const active = db.jobs.find(
    (j) => j.status === "active" && (!j.workerUserId || j.workerUserId === ctx.me.userId)
  );
  const props = { db, update, go, ctx, team, invites, refreshTeam, pullNow, signOut };

  let screen;
  switch (view.name) {
    case "pick":      screen = <Pick {...props} />; break;
    case "job":       screen = <Job {...props} jobId={view.id} />; break;
    case "finish":    screen = <Finish {...props} jobId={view.id} />; break;
    case "report":    screen = <Report {...props} jobId={view.id} />; break;
    case "customers": screen = <Customers {...props} customerId={view.id} />; break;
    case "schedule":  screen = <Schedule {...props} />; break;
    case "schedNew":  screen = <ScheduleNew {...props} />; break;
    case "team":      screen = ctx.role === "owner" ? <Team {...props} /> : <Home {...props} active={active} />; break;
    case "more":      screen = <More {...props} />; break;
    case "company":   screen = ctx.role === "owner" ? <Company {...props} /> : <More {...props} />; break;
    case "payroll":   screen = <Payroll {...props} />; break;
    case "assistant": screen = ctx.role === "owner" ? <Assistant {...props} /> : <Home {...props} active={active} />; break;
    case "measure":
      screen = (
        <MeasureEditor
          {...props}
          jobId={view.jobId}
          noteId={view.noteId}
          draftImage={view.draftImage}
        />
      );
      break;
    default:          screen = <Home {...props} active={active} />;
  }

  const tabs = ctx.role === "owner" ? OWNER_TABS : EMPLOYEE_TABS;
  const showNav = tabs.some((t) => t.key === view.name) && !view.id;
  const viewKey = `${view.name}:${view.id || ""}`;

  return (
    <div className="app" style={theme}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={viewKey}
          className="screen"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {screen}
        </motion.div>
      </AnimatePresence>

      {showNav && (
        <nav className="nav no-print">
          {tabs.map((t) => (
            <button key={t.key} className={view.name === t.key ? "on" : ""} onClick={() => go(t.key)}>
              {view.name === t.key && (
                <motion.span
                  layoutId="nav-dot"
                  className="nav-dot"
                  transition={{ type: "spring", damping: 30, stiffness: 500 }}
                />
              )}
              <Icon name={t.icon} size={22} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
      <Toaster />
    </div>
  );
}
