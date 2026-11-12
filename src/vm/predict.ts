import type { TraceStep } from "./trace";

export type PointerPrediction = { label: string; expected: number | null };

function pointerMap(step: TraceStep) {
  return new Map((step.pointers ?? []).filter(pointer => !pointer.from.startsWith("0x")).map(pointer => [pointer.from, pointer.to]));
}

export function nextPointerPrediction(current: TraceStep, next?: TraceStep): PointerPrediction | undefined {
  if (!next) return undefined;
  const before = pointerMap(current);
  const after = pointerMap(next);
  for (const [source, target] of after) {
    if (before.get(source) !== target) return { label: source, expected: target };
  }
  for (const [source, target] of before) {
    if (!after.has(source)) return { label: source, expected: null };
  }
  return undefined;
}

export function checkPrediction(answer: number | null, expected: number | null) {
  return answer === expected;
}
