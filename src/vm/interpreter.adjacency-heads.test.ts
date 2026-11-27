import { expect, it } from "vitest";
import { renderModel } from "../viz/model";
import { run } from "./interpreter";

it("records typed head slots after builders return and rewinds across a dangling head", () => {
  const result = run(`
#include <stdio.h>
#include <stdlib.h>
struct Edge { int to; struct Edge *next; };
struct Edge *head[50] = {NULL};
void prepend(struct Edge **links, int to) {
  struct Edge *edge = malloc(sizeof(struct Edge));
  edge->to = to;
  edge->next = links[0];
  links[0] = edge;
}
int main(void) {
  prepend(head, 1);
  prepend(head, 2);
  printf("%d %d\\n", head[0]->to, head[0]->next->to);
  head[1] = head[0]->next;
  free(head[0]);
  head[0] = NULL;
  free(head[1]);
  head[1] = NULL;
  return 0;
}
`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.leaks).toEqual([]);
  const steps = result.trace.steps;
  const declared = steps.find(step => step.frames[0]?.variables?.head)!;
  expect(declared.frames[0].variables?.head.arrayPointee).toBe("struct Edge");
  expect(declared.frames[0].variables?.head.array?.cells).toEqual([null, ...Array(49).fill(0)]);
  expect(declared.pointers).toEqual([]);
  const built = steps.find(step => step.stdout === "2 1\n" && step.frames.length === 2)!;
  const [first, second] = built.memory.allocations;
  const heads = (step: typeof built) => step.pointers?.filter(pointer => pointer.from.startsWith("file scope.head["));
  expect(heads(built)).toEqual([{ from: "file scope.head[0]", to: second.address, label: "head[0]", dangling: false }]);
  expect(renderModel(built).nodes.every(node => !node.orphaned)).toBe(true);
  const freed = steps.find(step => step.event === "free")!;
  expect(heads(freed)).toEqual([
    { from: "file scope.head[0]", to: second.address, label: "head[0]", dangling: true },
    { from: "file scope.head[1]", to: first.address, label: "head[1]", dangling: false }
  ]);
  expect(heads(steps.at(-1)!)).toEqual([]);
  expect(heads(result.trace.goto(built.index)!)).toEqual(heads(built));
});

it("uses typed head arrays, not integer arrays, as roots at exit", () => {
  const result = run(`
#include <stdlib.h>
struct Edge { int to; struct Edge *next; };
struct Edge *head[2] = {NULL};
int numbers[1];
void make(void) {
  struct Edge *edge = malloc(sizeof(struct Edge));
  edge->to = 1;
  edge->next = NULL;
  head[0] = edge;
  struct Edge *lost = malloc(sizeof(struct Edge));
  numbers[0] = (int)lost;
}
int main(void) { make(); return 0; }
`);
  expect(result.status, result.error?.reason).toBe("ok");
  const end = result.trace.steps.at(-1)!;
  const [owned, lost] = end.memory.allocations;
  expect(end.frames[0].variables?.numbers.array?.cells).toEqual([lost.address]);
  expect(end.frames[0].variables?.numbers.arrayPointee).toBeUndefined();
  expect(end.pointers?.some(pointer => pointer.to === owned.address)).toBe(true);
  expect(end.pointers?.some(pointer => pointer.to === lost.address)).toBe(false);
  expect(result.orphanedAtExit).toEqual([lost.address]);
  expect(renderModel(end).nodes.filter(node => node.orphaned).map(node => node.address)).toEqual([lost.address]);
});
