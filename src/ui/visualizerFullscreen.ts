import { useEffect, useRef, useState } from "react";

export function useVisualizerFullscreen() {
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const nativeActive = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onChange = () => {
      const next = document.fullscreenElement === panel.current && panel.current !== null;
      setFullscreen(next);
      if (nativeActive.current && !next) button.current?.focus({ preventScroll: true });
      nativeActive.current = next;
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const closeExpanded = (restoreFocus = true) => {
    setExpanded(false);
    if (restoreFocus) button.current?.focus({ preventScroll: true });
  };
  const exitFullscreen = async () => {
    try { await document.exitFullscreen(); }
    catch { /* Keep the active state until fullscreenchange; Esc still works. */ }
  };
  const restorePresentation = (wasFullscreen: boolean, wasExpanded: boolean) => {
    const target = panel.current;
    if (!target) return;
    setExpanded(wasExpanded);
    if (!wasFullscreen && document.fullscreenElement === target) void exitFullscreen();
    else if (wasFullscreen && document.fullscreenElement !== target) {
      // Fullscreen can require a browser gesture. Preserve the expanded view
      // if a keyboard-triggered exit cannot re-enter native fullscreen.
      if (!target.requestFullscreen || document.fullscreenEnabled === false) setExpanded(true);
      else void target.requestFullscreen().catch(() => setExpanded(true));
    }
  };
  const toggle = async () => {
    if (expanded) { closeExpanded(); return; }
    if (busy) return;
    const target = panel.current;
    if (!target) return;
    if (document.fullscreenElement === target) { await exitFullscreen(); return; }
    setBusy(true);
    try {
      if (target.requestFullscreen && document.fullscreenEnabled !== false) {
        await target.requestFullscreen();
        return;
      }
    } catch { /* Use the full-width workspace when the browser declines. */ }
    finally { setBusy(false); }
    setExpanded(true);
  };
  return { panel, button, fullscreen, expanded, busy, toggle, closeExpanded, exitFullscreen, restorePresentation };
}
