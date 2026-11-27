import type { TraceStep } from "../vm/trace";
import { maxGraphVertices } from "./graph";

export type AdjacencySelection = { base: number; invocation?: number; name: string };
type Neighbor = { vertex: number; address: number };
export type AdjacencyRow = {
  vertex: number;
  neighbors: Neighbor[];
  end: "NULL" | "unwritten link" | "invalid node" | "freed node" | "cycle" | "outside active vertices" | "display limit";
};
const maxNodesShown = 128;

export function selectedAdjacency(step: TraceStep, selection: AdjacencySelection) {
  const variable = step.frames.find(frame => frame.invocation === selection.invocation &&
    frame.variables?.[selection.name]?.array?.base === selection.base)?.variables?.[selection.name];
  return variable?.array && variable.arrayPointee && variable.adjacencyShape ? variable : undefined;
}

export function readAdjacencyList(step: TraceStep, selection: AdjacencySelection, size: number) {
  const variable = selectedAdjacency(step, selection);
  if (!variable || !Number.isInteger(size) || size < 1 || size > Math.min(maxGraphVertices, variable.array!.cells.length)) return;
  const { array, arrayPointee } = variable;
  const heap = new Map(step.heap?.map(node => [node.address, node]));
  const allocations = new Map(step.memory.allocations.map(item => [item.address, item]));
  const rows: AdjacencyRow[] = [];
  let budget = maxNodesShown;
  for (let vertex = 0; vertex < size; vertex++) {
    const row: AdjacencyRow = { vertex, neighbors: [], end: "NULL" };
    rows.push(row);
    const visited = new Set<number>();
    let next = array!.cells[vertex];
    while (next !== null && next !== 0) {
      if (typeof next !== "number" || !Number.isSafeInteger(next)) { row.end = "invalid node"; break; }
      if (visited.has(next)) { row.end = "cycle"; break; }
      if (!budget) { row.end = "display limit"; break; }
      const allocation = allocations.get(next);
      const node = heap.get(next);
      if (allocation?.freeStep !== undefined) { row.end = "freed node"; break; }
      if (!allocation || !node || node.type !== arrayPointee) { row.end = "invalid node"; break; }
      const to = node.adjacencyFields?.destination;
      if (to === undefined || !Number.isSafeInteger(to)) { row.end = "invalid node"; break; }
      if (to < 0 || to >= size) { row.end = "outside active vertices"; break; }
      row.neighbors.push({ vertex: to, address: next });
      visited.add(next);
      budget--;
      const link = node.adjacencyFields?.next;
      if (link === undefined) { row.end = "unwritten link"; break; }
      next = link;
    }
  }
  const edges = new Set(rows.flatMap(row => row.neighbors.map(node => row.vertex * size + node.vertex)));
  return { size, rows, directed: true, edges: [...edges].map(edge => {
    const from = Math.floor(edge / size), to = edge % size;
    return { from, to, paired: from !== to && edges.has(to * size + from), weight: 1 };
  }) };
}
