import { it, expect } from "vitest";
import { run } from "./interpreter";

const code = `#include <stdio.h>
#include <stdlib.h>
int main(void) {
  int **rows = malloc(2 * sizeof *rows);
  rows[0] = malloc(3 * sizeof **rows);
  int *named = malloc(3 * sizeof(int));
  rows[1] = named;
  for (int i=0; i<2; i++)
    for (int j=0; j<3; j++) rows[i][j] = 10 * i + j + 1;
  for (int i=0; i<2; i++) printf("%d %d %d\\n", rows[i][0], rows[i][1], rows[i][2]);
  free(rows[0]); free(rows[1]); free(rows);
  return 0;
}`;

it("records the same int stride for a direct and a named heap row, and rewinds cells", () => {
  const r = run(code);
  expect(r.status, r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("1 2 3\n11 12 13\n");
  const filled = r.trace.steps.find(s => s.stdout === "1 2 3\n11 12 13\n")!;
  const [table, first, second] = filled.memory.allocations;
  expect([table.size, first.size, second.size]).toEqual([8,12,12]);
  expect([first.elementSize, second.elementSize]).toEqual([4,4]);
  const tableBytes = filled.memory.bytes.slice(table.address, table.address + 8);
  const intAt = (bytes: readonly number[], start: number) =>
    (bytes[start] | (bytes[start + 1] << 8) | (bytes[start + 2] << 16) | (bytes[start + 3] << 24));
  expect([intAt(tableBytes,0), intAt(tableBytes,4)]).toEqual([first.address,second.address]);
  expect(filled.memory.bytes.slice(first.address, first.address + 12)).toEqual([1,0,0,0,2,0,0,0,3,0,0,0]);
  expect(filled.memory.bytes.slice(second.address, second.address + 12)).toEqual([11,0,0,0,12,0,0,0,13,0,0,0]);
  const write = r.trace.steps.find(s => s.memory.bytes[second.address + 8] === 13)!;
  expect(r.trace.goto(write.index - 1)?.memory.shadows.slice(second.address + 8, second.address + 12))
    .toEqual(Array(4).fill("allocated-uninitialized"));
  expect(r.trace.goto(write.index)?.memory.shadows.slice(second.address + 8, second.address + 12))
    .toEqual(Array(4).fill("initialized"));
  const order = r.trace.steps.at(-1)!.memory.allocations.slice().sort((a,b) => a.freeStep! - b.freeStep!);
  expect(order.map(a => a.address)).toEqual([first.address,second.address,table.address]);
  expect(r.leaks).toEqual([]);
});

it("preserves all four signed bytes of a nested int write", () => {
  const r = run(`int main(void){ int **rows=malloc(4); rows[0]=malloc(8);
    rows[0][1]=-513; printf("%d",rows[0][1]); free(rows[0]); free(rows);
  }`);
  expect(r.status,r.error?.reason).toBe("ok");
  const end = r.trace.steps.at(-1)!;
  expect(end.stdout).toBe("-513");
  const address = end.memory.allocations[1].address + 4;
  expect(end.memory.bytes.slice(address,address+4)).toEqual([255,253,255,255]);
});

it.each([
  ['rows[0][2]=7;', /column index out of bounds/],
  ['rows[1]=rows[0];', /row index out of bounds/],
  ['rows[0]=NULL; rows[0][0]=7;', /null matrix row pointer/],
  ['free(rows[0]); rows[0][0]=7;', /use-after-free/],
  ['free(rows); rows[0][0]=7;', /use-after-free/],
])("does not step into adjacent blocks or expired rows: %s", (tail, reason) => {
  const r = run(`int main(void){ int **rows=malloc(4); rows[0]=malloc(8); int *adjacent=malloc(8); ${tail} }`);
  expect(r.status).toBe("error");
  expect(r.error?.reason).toMatch(reason);
});

it("passes the exact nested cell address and doesn't evaluate an index twice", () => {
  const r = run(`int main(void) {
    int **rows=malloc(sizeof *rows);
    rows[0]=malloc(3*sizeof **rows);
    int i=1;
    rows[0][1]=27;
    int *cell=&rows[0][i++];
    printf("%d %d", *cell, i);
    free(rows[0]); free(rows);
  }`);
  expect(r.status,r.error?.reason).toBe("ok");
  const end = r.trace.steps.at(-1)!;
  expect(end.stdout).toBe("27 2");
  expect(Number(end.frames[0].variables?.cell?.value)).toBe(end.memory.allocations[1].address + 4);
});
