import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type MemoryViewRequest = { type: "fit" | "reset" };

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
export function DiagramViewport({ width, height, children, memoryViewRequest }: { width: number; height: number; children: ReactNode; memoryViewRequest?: MemoryViewRequest }) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number }>();
  const [manualZoom, setManualZoom] = useState<number | null>(1);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fitting = manualZoom === null;
  const diagramWidth = Math.max(1, width);
  const zoom = manualZoom ?? (availableWidth ? Math.min(MAX_ZOOM, availableWidth / diagramWidth) : 1);
  const percent = zoom * 100;
  const percentLabel = percent < 1 ? "<1%" : `${percent < 10 ? Number(percent.toFixed(1)) : Math.round(percent)}%`;
  const changeZoom = (value: number) => setManualZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)));
  const reset = (fit: boolean) => {
    const element = viewport.current;
    if (fit && element?.clientWidth) setAvailableWidth(element.clientWidth);
    setManualZoom(fit ? null : 1);
    if (element) { element.scrollLeft = 0; element.scrollTop = 0; }
  };
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!fitting || !element) return;
    const measure = () => { if (element.clientWidth > 0) setAvailableWidth(element.clientWidth); };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitting]);
  const previousRequest = useRef(memoryViewRequest);
  useEffect(() => { if (memoryViewRequest && previousRequest.current !== memoryViewRequest) { previousRequest.current = memoryViewRequest; reset(memoryViewRequest.type === "fit"); } }, [memoryViewRequest]);
  const endDrag = () => { drag.current = undefined; setDragging(false); };
  return <>
    <div className="diagram-tools" role="group" aria-label="Memory visualization view controls">
      <button type="button" aria-label="Zoom out memory visualization" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(zoom - 0.25)}>−</button>
      <output aria-label="Visualization zoom">{percentLabel}</output>
      <button type="button" aria-label="Zoom in memory visualization" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom < MIN_ZOOM ? MIN_ZOOM : zoom + 0.25)}>+</button>
      <button type="button" aria-pressed={fitting} onClick={() => reset(true)}>Fit width</button>
      <button type="button" onClick={() => reset(false)}>Reset view</button>
    </div>
    <p className="diagram-view-hint">Drag empty space to pan, or scroll. On touchscreens, swipe to move.</p>
    <div ref={viewport} className={`diagram-viewport${dragging ? " is-dragging" : ""}`} tabIndex={0} role="region" aria-label="Scrollable memory visualization"
      onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", " "].includes(event.key)) event.stopPropagation(); }}
      onPointerDown={event => {
        if (event.pointerType !== "mouse" || event.button !== 0 || (event.target as Element).closest(".diagram-node")) return;
        const element = event.currentTarget;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
        element.setPointerCapture(event.pointerId);
        setDragging(true);
        event.preventDefault();
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (!start || start.id !== event.pointerId) return;
        event.currentTarget.scrollLeft = start.left + start.x - event.clientX;
        event.currentTarget.scrollTop = start.top + start.y - event.clientY;
      }}
      onPointerUp={event => { if (drag.current?.id !== event.pointerId) return; event.currentTarget.releasePointerCapture(event.pointerId); endDrag(); }}
      onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
      <div className="diagram-scaled-content" style={{ width: diagramWidth * zoom, height: Math.max(1, height) * zoom }}>{children}</div>
    </div>
  </>;
}
