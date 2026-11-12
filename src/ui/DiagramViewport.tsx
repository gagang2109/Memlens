import { useRef, useState, type ReactNode } from "react";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
export function DiagramViewport({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number }>();
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const changeZoom = (value: number) => setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)));
  const reset = (fit: boolean) => {
    const element = viewport.current;
    changeZoom(fit && element ? element.clientWidth / Math.max(1, width) : 1);
    if (element) { element.scrollLeft = 0; element.scrollTop = 0; }
  };
  const endDrag = () => { drag.current = undefined; setDragging(false); };
  return <>
    <div className="diagram-tools" role="group" aria-label="Memory visualization view controls">
      <button type="button" aria-label="Zoom out memory visualization" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(zoom - 0.25)}>−</button>
      <output aria-label="Visualization zoom">{Math.round(zoom * 100)}%</output>
      <button type="button" aria-label="Zoom in memory visualization" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom + 0.25)}>+</button>
      <button type="button" onClick={() => reset(true)}>Fit width</button>
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
      <div className="diagram-scaled-content" style={{ width: Math.max(1, width) * zoom, height: Math.max(1, height) * zoom }}>{children}</div>
    </div>
  </>;
}
