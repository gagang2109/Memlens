import { useRef } from "react";

export type SplitSizes = [number, number, number];
export const balancedSplit: SplitSizes = [36, 40, 24];
const minSize = 20;
export function resizeSplit(values: SplitSizes, boundary: 0 | 1, change: number): SplitSizes {
  const result: SplitSizes = [...values];
  const total = values[boundary] + values[boundary+1];
  result[boundary] = Math.min(total - minSize, Math.max(minSize, values[boundary] + change));
  result[boundary+1] = total - result[boundary];
  return result;
}
export function SplitDivider({ boundary, sizes, onSize }: { boundary: 0 | 1; sizes: SplitSizes; onSize: (sizes: SplitSizes) => void }) {
  const drag = useRef<{ id: number; x: number; initial: SplitSizes; unitsPerPixel: number }>();
  return <div className={`split-divider split-divider-${boundary}`} role="separator" aria-orientation="vertical" tabIndex={0}
    aria-label={boundary === 0 ? "Resize code and memory" : "Resize memory and terminal"} aria-controls={boundary === 0 ? "code memory" : "memory console"}
    aria-valuemin={minSize} aria-valuemax={sizes[boundary] + sizes[boundary+1] - minSize} aria-valuenow={Math.round(sizes[boundary])}
    onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
      event.preventDefault();
      const change = event.key === "ArrowLeft" ? -2 : event.key === "ArrowRight" ? 2 : event.key === "Home" ? -100 : 100;
      onSize(resizeSplit(sizes, boundary, change));
    }}
    onPointerDown={event => {
      if (event.button !== 0 || drag.current) return;
      const workspace = event.currentTarget.parentElement;
      if (!workspace) return;
      const twoPanes = workspace.querySelector(".console-window:not(.console-window-docked)") !== null;
      const pixels = workspace.clientWidth - (twoPanes ? 10 : 20);
      if (pixels <= 0) return;
      drag.current = { id:event.pointerId, x:event.clientX, initial:sizes, unitsPerPixel:(twoPanes ? 100-sizes[2] : 100) / pixels };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const grip = drag.current;
      if (!grip || grip.id !== event.pointerId) return;
      onSize(resizeSplit(grip.initial,boundary,(event.clientX-grip.x)*grip.unitsPerPixel));
    }}
    onPointerUp={event => {
      if (drag.current?.id !== event.pointerId) return;
      drag.current = undefined;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={()=>{drag.current=undefined;}} onLostPointerCapture={()=>{drag.current=undefined;}}>
    <span aria-hidden="true"/>
  </div>;
}
