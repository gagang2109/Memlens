import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

type Mode = "docked" | "floating" | "minimized";
type Bounds = { left: number; top: number; width: number; height: number };
type Action = "move" | "resize";
const edge = 8;
const step = 16;
const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as const;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function fit(bounds: Bounds, action: Action): Bounds {
  const maxWidth = Math.max(1, window.innerWidth - edge * 2);
  const maxHeight = Math.max(1, window.innerHeight - edge * 2);
  const minWidth = Math.min(280, maxWidth);
  const minHeight = Math.min(180, maxHeight);
  const width = clamp(bounds.width, minWidth, maxWidth);
  const height = clamp(bounds.height, minHeight, maxHeight);
  const left = clamp(bounds.left, edge, edge + maxWidth - (action === "resize" ? minWidth : width));
  const top = clamp(bounds.top, edge, edge + maxHeight - (action === "resize" ? minHeight : height));
  return {
    left, top,
    width: Math.min(width, edge + maxWidth - left),
    height: Math.min(height, edge + maxHeight - top),
  };
}

function moveOrResize(bounds: Bounds, action: Action, dx: number, dy: number): Bounds {
  return fit(action === "move"
    ? { ...bounds, left: bounds.left + dx, top: bounds.top + dy }
    : { ...bounds, width: bounds.width + dx, height: bounds.height + dy }, action);
}

export function ConsoleWindow({ children, waiting, focused, onFocusPane, dockRequest, revealRequest }: { children: ReactNode; waiting: boolean; focused: boolean; onFocusPane: () => void; dockRequest: number; revealRequest: number }) {
  const [mode, setMode] = useState<Mode>("docked");
  const [bounds, setBounds] = useState<Bounds>();
  const picker = useRef<HTMLButtonElement>(null);
  const nextFocus = useRef(false);
  const previousDock = useRef(dockRequest);
  const previousReveal = useRef(revealRequest);
  const drag = useRef<{ pointer: number; action: Action; x: number; y: number; bounds: Bounds }>();
  function changeMode(next: Mode, focus = true) {
    drag.current = undefined;
    nextFocus.current = focus;
    if (next === "floating") {
      setBounds(previous => fit(previous ?? {
        left: window.innerWidth - 528, top: window.innerHeight - 348, width: 520, height: 340,
      }, "move"));
    }
    setMode(next);
  }

  useEffect(() => {
    if (previousDock.current !== dockRequest) {
      previousDock.current = dockRequest;
      drag.current = undefined;
      setMode("docked");
    }
  }, [dockRequest]);
  useEffect(() => {
    if (previousReveal.current !== revealRequest) {
      previousReveal.current = revealRequest;
      if (mode === "minimized") changeMode("floating", false);
    }
  }, [revealRequest, mode]);
  useEffect(() => {
    if (nextFocus.current) {
      nextFocus.current = false;
      picker.current?.focus();
    }
  }, [mode]);
  useEffect(() => {
    // A new input request should not go unnoticed in a minimized terminal.
    if (waiting) {
      setBounds(previous => previous && fit(previous, "move"));
      setMode(previous => previous === "minimized" ? "floating" : previous);
    }
  }, [waiting]);
  useEffect(() => {
    if (mode !== "floating") return;
    const handleResize = () => setBounds(previous => previous && fit(previous, "move"));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mode]);

  function start(event: PointerEvent<HTMLElement>, action: Action) {
    if (event.button !== 0 || !bounds || drag.current) return;
    drag.current = { pointer: event.pointerId, action, x: event.clientX, y: event.clientY, bounds };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function track(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) return;
    setBounds(moveOrResize(current.bounds, current.action, event.clientX - current.x, event.clientY - current.y));
  }
  function finish(event: PointerEvent<HTMLElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboard(event: KeyboardEvent<HTMLElement>, action: Action) {
    if (!Object.hasOwn(arrows, event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const [dx, dy] = arrows[event.key as keyof typeof arrows];
    setBounds(previous => previous && moveOrResize(previous, action, dx * step, dy * step));
  }
  const pointerEvents = { onPointerMove: track, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish };
  const arrowsHint = "ArrowUp ArrowDown ArrowLeft ArrowRight";

  return <section id="console" className={`console-window console-window-${mode}${focused ? " console-window-focused" : ""}`} tabIndex={-1} aria-label="Console section"
    style={mode === "floating" && !focused ? bounds : undefined}
    onFocus={event => { if (event.target === event.currentTarget && mode === "minimized") changeMode("floating"); }}>
    <div className="console-window-bar" data-run-shortcut="ignore">
      <span className="console-window-title" {...(mode === "floating" && !focused ? { onPointerDown: (event: PointerEvent<HTMLSpanElement>) => start(event, "move"), ...pointerEvents } : {})}>Terminal</span>
      {mode !== "minimized" && <button type="button" onClick={onFocusPane}>{focused ? "Restore workspace" : "Focus terminal"}</button>}
      {!focused && mode === "docked" && <button ref={picker} type="button" onClick={() => changeMode("floating")}>Float terminal</button>}
      {!focused && mode === "floating" && <>
        <button className="console-window-move" type="button" aria-keyshortcuts={arrowsHint} title="Drag or use arrow keys to move"
          aria-label="Move terminal" onKeyDown={event => keyboard(event, "move")}
          onPointerDown={event => start(event, "move")} {...pointerEvents}>Move</button>
        <button ref={picker} type="button" aria-label="Minimize" onClick={() => changeMode("minimized")}><span className="console-window-dot" aria-hidden="true">−</span>Minimize</button>
      </>}
      {mode === "minimized" && <button ref={picker} type="button" onClick={() => changeMode("floating")}>Restore terminal</button>}
      {!focused && mode !== "docked" && <button type="button" onClick={() => changeMode("docked")}>Dock</button>}
    </div>
    <div className="console-window-body" hidden={mode === "minimized"}>{children}</div>
    {!focused && mode === "floating" && <button className="console-window-resize" data-run-shortcut="ignore" type="button" aria-label="Resize terminal" aria-keyshortcuts={arrowsHint}
      title="Drag or use arrow keys to resize" onKeyDown={event => keyboard(event, "resize")}
      onPointerDown={event => start(event, "resize")} {...pointerEvents}>Resize ◢</button>}
  </section>;
}
