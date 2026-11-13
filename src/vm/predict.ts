import type { TraceStep } from "./trace";

export type PointerPrediction = { label: string; expected: number | null };

function pointerMap(step: TraceStep) {
  const pointers = new Map<string, number | null>((step.pointers ?? [])
    .filter(pointer => !pointer.from.startsWith("0x"))
    .map(pointer => [pointer.from, pointer.to === 0 ? null : pointer.to]));
  // NULL-valued variables have no arrow. Keep them distinct from locals
  // that disappeared when their function returned, or became string pointers.
  for (const frame of step.frames) {
    for (const [name, variable] of Object.entries(frame.variables ?? {})) {
      if (variable.pointer && !variable.stringPointer && variable.value === "null") {
        pointers.set(`${frame.name}.${name}`, null);
      }
    }
  }
  return pointers;
}

export function nextPointerPrediction(current: TraceStep, next?: TraceStep): PointerPrediction | undefined {
  if (!next) return undefined;
  // Trace labels use function.variable, not a unique recursive frame ID.
  // Do not quiz an ambiguous local in either snapshot (including a return).
  const ambiguousFrames = new Set<string>();
  for (const step of [current, next]) {
    const names = new Set<string>();
    for (const frame of step.frames) {
      if (names.has(frame.name)) ambiguousFrames.add(frame.name);
      names.add(frame.name);
    }
  }
  const before = pointerMap(current);
  const after = pointerMap(next);
  for (const [source, target] of after) {
    if (ambiguousFrames.has(source.slice(0, source.indexOf(".")))) continue;
    if (before.get(source) !== target) return { label: source, expected: target };
  }
  return undefined;
}

export function checkPrediction(answer: number | null, expected: number | null) {
  return answer === expected;
}
