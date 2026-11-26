import type { TraceStep } from "../vm/trace";

export const markerLimit = 128;

function sample<T>(items: readonly T[], count: number): T[] {
  if (count <= 0) return [];
  if (items.length <= count) return [...items];
  if (count === 1) return [items[Math.floor(items.length / 2)]];
  return Array.from({ length: count }, (_, i) => items[Math.round(i * (items.length - 1) / (count - 1))]);
}

export function traceMarkers(steps: readonly TraceStep[]) {
  const events: number[] = [];
  const important: number[] = [];
  steps.forEach(({ event }, index) => {
    if (event && event !== "step") events.push(index);
    if (event === "error" || event === "warning" || event === "alloc" || event === "free") important.push(index);
  });
  if (steps.length <= markerLimit) return { indexes: steps.map((_, i) => i), events };

  const end = steps.length - 1;
  const markers = new Set([0, end]);
  const add = (items: readonly number[], count: number) => {
    for (const index of sample(items.filter(index => !markers.has(index)), count)) markers.add(index);
  };
  add(important, 78);
  add(events, Math.min(32, markerLimit - markers.size));
  const remaining = markerLimit - markers.size;
  for (let i = 1; i <= remaining; i++) markers.add(Math.round(i * end / (remaining + 1)));
  return { indexes: [...markers].sort((a, b) => a - b), events };
}

/** Binary search on the exact event indexes, not the downsampled painted ticks. */
export function adjacentEvents(events: readonly number[], cursor: number) {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (events[mid] < cursor) low = mid + 1;
    else high = mid;
  }
  return { previous: events[low - 1], next: events[events[low] === cursor ? low + 1 : low] };
}
