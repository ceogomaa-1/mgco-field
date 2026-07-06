import { useEffect, useRef, useState } from "react";

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
  settingsRev: 0,
  customers: [],
  jobs: [],
  favorites: [],
  favRev: 0,
  deletedIds: [],
};

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULTS),
      ...d,
      settings: { ...DEFAULTS.settings, ...d.settings },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

/**
 * Local-first store, keyed PER USER so two accounts on the same phone can
 * never see each other's cache. Cloud sync runs on top (see sync.js).
 */
export function useDb(storageKey) {
  const [db, setDb] = useState(() => load(storageKey));
  const t = useRef();
  const keyRef = useRef(storageKey);

  // switching accounts re-hydrates from that user's own cache
  useEffect(() => {
    if (keyRef.current !== storageKey) {
      keyRef.current = storageKey;
      setDb(load(storageKey));
    }
  }, [storageKey]);

  // debounced persistence — photos make the payload chunky, don't write per keystroke
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      try {
        localStorage.setItem(keyRef.current, JSON.stringify(db));
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

  return [db, update, setDb];
}

/* mutation helpers — every job change must bump rev so sync picks it up */
export const touchJob = (j) => {
  j.rev = (j.rev || 0) + 1;
};
