import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDb } from "./db";
import { Icon } from "./icons";
import { Toaster } from "./ui";
import Home from "./views/Home";
import Pick from "./views/Pick";
import Job from "./views/Job";
import Finish from "./views/Finish";
import Report from "./views/Report";
import Customers from "./views/Customers";
import Schedule from "./views/Schedule";
import ScheduleNew from "./views/ScheduleNew";
import More from "./views/More";
import Company from "./views/Company";
import Team from "./views/Team";
import Payroll from "./views/Payroll";
import Assistant from "./views/Assistant";

const TABS = [
  { key: "home", label: "Today", icon: "clock" },
  { key: "schedule", label: "Schedule", icon: "calendar" },
  { key: "customers", label: "Customers", icon: "users" },
  { key: "more", label: "More", icon: "grid" },
];

export default function App() {
  const [db, update] = useDb();
  const [view, setView] = useState({ name: "home" });
  const go = (name, params = {}) => {
    setView({ name, ...params });
    window.scrollTo(0, 0);
  };

  const props = { db, update, go };
  const active = db.jobs.find((j) => j.status === "active");

  let screen;
  switch (view.name) {
    case "pick":      screen = <Pick {...props} />; break;
    case "job":       screen = <Job {...props} jobId={view.id} />; break;
    case "finish":    screen = <Finish {...props} jobId={view.id} />; break;
    case "report":    screen = <Report {...props} jobId={view.id} />; break;
    case "customers": screen = <Customers {...props} customerId={view.id} />; break;
    case "schedule":  screen = <Schedule {...props} />; break;
    case "schedNew":  screen = <ScheduleNew {...props} />; break;
    case "more":      screen = <More {...props} />; break;
    case "company":   screen = <Company {...props} />; break;
    case "team":      screen = <Team {...props} />; break;
    case "payroll":   screen = <Payroll {...props} />; break;
    case "assistant": screen = <Assistant {...props} />; break;
    default:          screen = <Home {...props} active={active} />;
  }

  const showNav = ["home", "schedule", "customers", "more"].includes(view.name) && !view.id;
  const tab = view.name;
  const viewKey = `${view.name}:${view.id || ""}`;

  return (
    <div className="app">
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
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? "on" : ""}
              onClick={() => go(t.key)}
            >
              {tab === t.key && (
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
