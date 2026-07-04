import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { Icon } from "./icons";

export function TopBar({ title, sub, onBack, right }) {
  return (
    <div className="topbar no-print">
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="chevronLeft" size={20} />
        </button>
      )}
      <div className="tb-t">
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </div>
      {right || null}
    </div>
  );
}

export function Sheet({ title, onClose, children }) {
  const controls = useDragControls();
  return (
    <>
      <motion.div
        className="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.div
        className="sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 34, stiffness: 380 }}
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(e, info) => {
          if (info.offset.y > 110 || info.velocity.y > 600) onClose();
        }}
      >
        <div className="grabber-zone" onPointerDown={(e) => controls.start(e)}>
          <div className="grabber" />
        </div>
        <div className="sheet-head">
          <b>{title}</b>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </>
  );
}

export function Field({ label, hint, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

/* ---------- toast ---------- */

export function toast(msg) {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: msg }));
}

export function Toaster() {
  const [msg, setMsg] = useState(null);
  const t = useRef();
  useEffect(() => {
    const h = (e) => {
      setMsg(e.detail);
      clearTimeout(t.current);
      t.current = setTimeout(() => setMsg(null), 2800);
    };
    window.addEventListener("app-toast", h);
    return () => {
      window.removeEventListener("app-toast", h);
      clearTimeout(t.current);
    };
  }, []);
  return (
    <AnimatePresence>
      {msg && (
        <motion.div
          className="toast no-print"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", damping: 26, stiffness: 400 }}
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
