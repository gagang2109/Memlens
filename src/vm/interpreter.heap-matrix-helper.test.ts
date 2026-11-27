import { expect, it } from "vitest";
import { parse } from "../lang/parser";
import { readHeapMatrix } from "../ui/HeapMatrixDiagram";
import { run } from "./interpreter";

it("returns the actual heap-row pointers from a matrix constructor and rewinds input writes", () => {
  const source = `#include <stdio.h>
#include <stdlib.h>
int **make(int rows, int cols);
int **make(int rows, int cols) {
  int **data = malloc(rows * sizeof(int *));
  for (int i = 0; i < rows; i++) *(data + i) = calloc(cols, sizeof(int));
  return data;
}
void fill(int **data) {
  scanf("%d", *(data + 1) + 1);
}
int main(void) {
  int **a = make(2, 3), **b = make(2, 3);
  a[0][2] = 19;
  fill(a);
  b[1][1] = -31;
  printf("%d %d %d %d", a[0][2], a[1][1], b[1][1], b[0][2]);
  for (int i = 0; i < 2; i++) { free(a[i]); free(b[i]); }
  free(a); free(b);
  return 0;
}`;
  expect(parse(source).functions.get("make")?.returnPointerDepth).toBe(2);
  const result = run(source, undefined, undefined, "257");
  expect(result.status, result.error?.reason).toBe("ok");
  const end = result.trace.steps.at(-1)!;
  expect(end.stdout).toBe("19 257 -31 0");
  expect(result.leaks).toEqual([]);
  expect(end.memory.allocations).toHaveLength(6);
  expect(end.memory.allocations.every(a => a.freeStep !== undefined)).toBe(true);
  const [table, row0, row1] = end.memory.allocations;
  const at = result.trace.steps.findIndex(step => step.memory.bytes[row1.address + 4] === 1 &&
    step.memory.bytes[row1.address + 5] === 1);
  expect(at).toBeGreaterThan(0);
  const view = (step: number) => readHeapMatrix(result.trace.goto(step)!.memory, table.address)?.rows;
  for (const [atStep, cell] of [[at, 257], [at - 1, 0], [at, 257]]) {
    const rows = view(atStep);
    expect(rows?.map(r => r.slot.value)).toEqual([row0.address, row1.address]);
    expect(rows?.[0].cells?.map(c => c.value)).toEqual([0, 0, 19]);
    expect(rows?.[1].cells?.map(c => c.value)).toEqual([0, cell, 0]);
  }
});

it("still marks a contiguous pointer-to-array declarator as unsupported instead of treating it as int **", () => {
  const result = run(`int main(void) {
    int (*grid)[3] = malloc(2 * sizeof *grid);
    return 0;
  }`);
  expect(result.error?.diagnosticKind).toBe("unsupported-c");
  expect(result.error?.line).toBe(2);
  expect(result.error?.reason).toContain("pointers to arrays");
  expect(result.trace.steps.at(-1)?.memory.allocations).toEqual([]);
});

it("retains the return type's pointer depth for unevaluated array indexes", () => {
  const result = run(`char **helper(void) { printf("not called"); return 0; }
int main(void) {
  int data[2][3];
  printf("%zu", sizeof data[**helper()]);
  return 0;
}`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("12");
});
