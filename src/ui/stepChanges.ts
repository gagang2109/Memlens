import type { FrameVariable, PointerArrow, TraceStep } from "../vm/trace";

export const frameKey = (invocation: number | undefined, name: string, depth: number) =>
  invocation === undefined ? `${name}-${depth}` : `call-${invocation}`;
export const showCell = (value: number | string | null) => typeof value === "string" ? JSON.stringify(value) : String(value);
const showPointer = (address: number) => address === 0 ? "NULL" : `0x${address.toString(16)}`;
function showVariable(variable: FrameVariable) {
  if (!variable.pointer || variable.stringPointer) return variable.stringPointer ? JSON.stringify(variable.value) : variable.value;
  const address = variable.value === "null" ? 0 : Number(variable.value);
  return Number.isSafeInteger(address) ? showPointer(address) : variable.value;
}

type Change = { before: string; after: string };
export type VariableChange = Change | { cells: ReadonlyMap<number, Change> };
export type StepChanges = { frames: ReadonlyMap<number, ReadonlyMap<string, VariableChange>>; heap: ReadonlyMap<number, string> };
export const describeChange = (change: Change) => `${change.before} → ${change.after}`;

export function stepChanges(previous?: TraceStep, current?: TraceStep): StepChanges {
  const frames = new Map<number, Map<string, VariableChange>>();
  const heap = new Map<number, string>();
  if (!previous || !current) return { frames, heap };

  const invocations = new Map(previous.frames.map(frame => [frame.invocation, frame]));
  for (const frame of current.frames) {
    if (frame.invocation === undefined) continue;
    const oldFrame = invocations.get(frame.invocation);
    if (!oldFrame?.variables || !frame.variables) continue;
    const changes = new Map<string, VariableChange>();
    for (const [name, value] of Object.entries(frame.variables)) {
      const old = oldFrame.variables[name];
      if (!old || old.storage !== value.storage || old.type !== value.type) continue;
      if (old.array && value.array && old.array.base === value.array.base && old.array !== value.array) {
        const cells = new Map<number, Change>();
        value.array.cells.forEach((cell, index) => {
          const before = old.array!.cells[index];
          if (before !== undefined && !Object.is(before, cell)) cells.set(index, { before: showCell(before), after: showCell(cell) });
        });
        if (cells.size) changes.set(name, { cells });
      } else if (!old.array && !value.array &&
        (old.value !== value.value || old.stringPointer !== value.stringPointer)) {
        changes.set(name, { before: showVariable(old), after: showVariable(value) });
      }
    }
    if (changes.size) frames.set(frame.invocation, changes);
  }

  function edgeMap(arrows?: PointerArrow[]) {
    return new Map(arrows?.filter(arrow => arrow.from.startsWith("0x")).map(arrow => [arrow.from, arrow.to]));
  }
  const oldEdges = edgeMap(previous.pointers), newEdges = edgeMap(current.pointers);
  const oldObjects = new Map(previous.heap?.map(object => [object.address, object]));
  for (const object of current.heap ?? []) {
    const old = oldObjects.get(object.address);
    if (!old) continue;
    const changes = [];
    for (const [field, next] of Object.entries(object.fields)) {
      const value = old.fields[field];
      if (value === next) continue;
      const key = `0x${object.address.toString(16)}.${field}`;
      const oldTarget = oldEdges.get(key), newTarget = newEdges.get(key);
      const pointer = oldTarget !== undefined || newTarget !== undefined;
      const before = oldTarget !== undefined ? showPointer(oldTarget) : pointer && value === "null" ? "NULL" : (value ?? "not set");
      const after = newTarget !== undefined ? showPointer(newTarget) : pointer && next === "null" ? "NULL" : next;
      changes.push(`${field}: ${before} → ${after}`);
    }
    if (changes.length) heap.set(object.address, changes.join(" · "));
  }
  return { frames, heap };
}
