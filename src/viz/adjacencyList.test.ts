import { expect, it } from "vitest";
import { readAdjacencyList } from "./adjacencyList";
import { run } from "../vm/interpreter";

it("preserves order, addresses and isolated vertices with a larger file-scope array", () => {
  const make = (first: number) => run(`
struct Edge { int to; struct Edge *next; };
struct Edge *heads[50] = {NULL};
void prepend(int vertex, int to) {
  struct Edge *edge = malloc(sizeof *edge);
  edge->to = to;
  edge->next = heads[vertex];
  heads[vertex] = edge;
}
int main(void) {
  prepend(0, ${first});
  prepend(0, ${3 - first});
  prepend(1, 3);
  prepend(2, 3);
  printf("built");
  free(heads[0]);
  heads[0] = NULL;
  return 0;
}
`);
  const decoded = [1, 2].map(first => {
    const result = make(first);
    expect(result.status, result.error?.reason).toBe("ok");
    const steps = result.trace.steps;
    const built = steps.find(s => s.stdout === "built")!;
    const root = built.frames[0].variables!.heads;
    const selection = { name:"heads", invocation:built.frames[0].invocation, base:root.array!.base };
    const graph = readAdjacencyList(built, selection, 5)!;
    expect(root.array?.cells).toHaveLength(50);
    expect(graph.rows.map(row => row.neighbors.map(node => node.vertex))).toEqual([[3-first, first], [3], [3], [], []]);
    expect(graph.rows[0].neighbors.map(n => n.address)).toEqual(built.memory.allocations.slice(0,2).reverse().map(a => a.address));
    expect(graph.rows[4].end).toBe("NULL");
    expect(readAdjacencyList(built, selection, 50)).toBeUndefined();
    expect(readAdjacencyList(built, selection, 3)?.rows[1].end).toBe("outside active vertices");
    expect(readAdjacencyList(steps.find(s => s.event === "free")!, selection, 5)?.rows[0].end).toBe("freed node");
    expect(readAdjacencyList(steps.at(-1)!, selection, 5)?.rows[0].end).toBe("NULL");
    expect(readAdjacencyList(result.trace.goto(built.index)!, selection, 5)).toEqual(graph);
    return graph.edges.map(edge => edge.from * 5 + edge.to).sort();
  });
  expect(decoded[0]).toEqual(decoded[1]);
});

it("rejects a numeric next member even when the generic trace mistakes it for an arrow", () => {
  const result = run(`
struct Entry { int to; int next; };
int main(void) {
  struct Entry *heads[4] = {NULL};
  struct Entry *tail = malloc(16);
  struct Entry *head = malloc(16);
  head->to = 1;
  head->next = 4096;
  heads[0] = head;
  return 0;
}
`);
  expect(result.status, result.error?.reason).toBe("ok");
  const end = result.trace.steps.at(-1)!;
  const [tail, head] = end.memory.allocations;
  const root = end.frames[0].variables!.heads;
  expect(end.pointers?.some(p => p.from === "0x" + head.address.toString(16) + ".next" && p.to === tail.address)).toBe(true);
  expect(readAdjacencyList(end, { name:"heads", invocation:0, base:root.array!.base }, 4)).toBeUndefined();
});

it("bounds cycles and selects the right same-named recursive array", () => {
  const result = run(`
struct Edge { int vertex; struct Edge *next; };
void build(int item) {
  struct Edge *head[4] = {NULL};
  struct Edge *edge = malloc(16);
  edge->vertex = item;
  edge->next = edge;
  head[0] = edge;
  if (item == 1) build(2);
  free(edge);
}
int main(void) { build(1); return 0; }
`);
  expect(result.status, result.error?.reason).toBe("ok");
  const step = result.trace.steps.find(s => s.frames.length === 3 && s.frames[2].variables?.head?.array?.cells[0])!;
  const [, outer, inner] = step.frames;
  const [a,b] = [outer,inner].map(frame => ({
    name:"head", invocation:frame.invocation, base:frame.variables!.head.array!.base,
  }));
  expect(readAdjacencyList(step, a, 4)?.rows[0].neighbors.map(x => x.vertex)).toEqual([1]);
  expect(readAdjacencyList(step, b, 4)?.rows[0].neighbors.map(x => x.vertex)).toEqual([2]);
  expect(readAdjacencyList(step, b, 4)?.rows[0].end).toBe("cycle");
  expect(readAdjacencyList(step, { ...a, invocation:b.invocation }, 4)).toBeUndefined();
});
