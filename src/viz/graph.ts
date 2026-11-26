import type { ArraySnapshot, FrameVariable, TraceStep } from "../vm/trace";

export const maxGraphVertices = 16;

export function graphSize(array: ArraySnapshot) {
  const [rows, columns] = array.dimensions;
  return array.dimensions.length === 2 && rows === columns && rows > 0 && rows <= maxGraphVertices &&
    array.cells.length === rows * columns && array.cells.every(value => typeof value === "number" && Number.isFinite(value)) ? rows : 0;
}

export function readGraph(array: ArraySnapshot, preferUndirected: boolean) {
  const size = graphSize(array);
  if (!size) return undefined;
  const value = (from: number, to: number) => Number(array.cells[from * size + to]);
  const directed = !preferUndirected || array.cells.some((weight, i) => weight !== value(i % size, Math.floor(i / size)));
  const edges = [];
  for (let from = 0; from < size; from++) {
    for (let to = directed ? 0 : from; to < size; to++) {
      const weight = value(from, to);
      if (weight !== 0) edges.push({ from, to, weight, paired: directed && from !== to && value(to, from) !== 0 });
    }
  }
  return { size, edges, directed };
}

type Traversal = { kind: "BFS" | "DFS"; active?: number; pending: readonly number[]; discovered: readonly number[] };
// Only used for the exact bundled graph lab. Similar variable names in arbitrary C are not evidence of these conventions.
export function readLabTraversal(step: TraceStep, size: number): Traversal | undefined {
  const vertex = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < size;
  const int = (v?: FrameVariable) => v && !v.pointer && !v.array && /^-?\d+$/.test(v.value) ? Number(v.value) : undefined;
  const discovered = (array?: ArraySnapshot) => array?.cells.flatMap((value, i) => i < size && value === 1 ? [i] : []) ?? [];
  const bfs = step.frames.find(frame => frame.name === "bfs");
  if (bfs?.variables) {
    const { q, front, rear, v, seen } = bfs.variables;
    const start = int(front), end = int(rear);
    const cells = q?.array?.cells;
    const pending = cells && start !== undefined && end !== undefined && start >= 0 && start <= end && end <= cells.length
      ? cells.slice(start, end).filter((item): item is number => vertex(item))
      : [];
    const active = int(v);
    return { kind: "BFS", active: vertex(active) ? active : undefined, pending, discovered: discovered(seen?.array) };
  }
  const dfs = step.frames.filter(frame => frame.name === "dfs");
  if (dfs.length) {
    const pending = dfs.flatMap(frame => {
      const value = int(frame.variables?.v);
      return value !== undefined && vertex(value) ? [value] : [];
    });
    const main = step.frames.find(frame => frame.name === "main");
    return { kind: "DFS", active: pending.at(-1), pending, discovered: discovered(main?.variables?.seen?.array) };
  }
}
