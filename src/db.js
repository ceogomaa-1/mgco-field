import { useEffect, useRef, useState } from "react";

const KEY = "mgco-field-v1";

const DEFAULTS = {
  settings: {
    company: "",
    phone: "",
    email: "",
    logo: null,
    banner: null,
    rate: 85,
    currency: "$",
    taxRate: 13,
    theme: { accent: "#f2a71b" },
  },
  customers: [],
  jobs: [],
  favorites: [],
  workers: [],
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const d = JSON.parse(raw);
    return { ...DEFAULTS, ...d, settings: { ...DEFAULTS.settings, ...d.settings } };
  } catch {
    return DEFAULTS;
  }
}

export function useDb() {
  const [db, setDb] = useState(load);
  const t = useRef();

  // debounced persistence — photos make the payload chunky, don't write per keystroke
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(db));
      } catch (e) {
        console.warn("Could not save (storage full?)", e);
      }
    }, 250);
    return () => clearTimeout(t.current);
  }, [db]);

  const update = (fn) =>
    setDb((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  return [db, update];
}
