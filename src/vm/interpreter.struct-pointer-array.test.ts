import { expect, it } from "vitest";
import { run } from "./interpreter";

it("allocates only the actual edge nodes for a stack array of adjacency heads", () => {
  const result = run(`
#include <stdio.h>
#include <stdlib.h>
struct Edge { int to; struct Edge *next; };
void prepend(struct Edge **heads, int to) {
  struct Edge *edge = malloc(sizeof(struct Edge));
  edge->to = to;
  edge->next = heads[0];
  heads[0] = edge;
}
int main(void) {
  struct Edge *heads[4] = {NULL, NULL, NULL, NULL};
  prepend(heads, 1);
  prepend(heads, 2);
  printf("%d %d %d\\n", heads[0]->to, heads[0]->next->to, heads[3] == NULL);
  struct Edge *first = heads[0];
  heads[0] = first->next;
  free(first);
  free(heads[0]);
  heads[0] = NULL;
  return 0;
}
`);
  expect(result.status, result.error?.reason).toBe("ok");
  const last = result.trace.steps.at(-1)!;
  expect(last.stdout).toBe("2 1 1\n");
  const declared = result.trace.steps.find(step => step.frames[0]?.variables?.heads);
  expect(declared?.memory.allocations).toEqual([]);
  expect(last.memory.allocations).toHaveLength(2);
  expect(last.memory.allocations.every(allocation => allocation.freeStep !== undefined)).toBe(true);
  expect(result.leaks).toEqual([]);
});

it("keeps the simulated backing objects for scalar and array struct values", () => {
  const result = run(`
#include <stdio.h>
struct Entry { int key; };
int main(void) {
  struct Entry single;
  struct Entry pair[2];
  single.key = 11;
  pair[0].key = 22;
  pair[1].key = 33;
  printf("%d %d %d\\n", single.key, pair[0].key, pair[1].key);
  return 0;
}
`);
  expect(result.status, result.error?.reason).toBe("ok");
  const last = result.trace.steps.at(-1)!;
  expect(last.stdout).toBe("11 22 33\n");
  expect(last.memory.allocations).toHaveLength(3);
});
