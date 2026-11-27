import { it, expect } from "vitest";
import { run } from "./interpreter";
import { readHeapMatrix } from "../ui/HeapMatrixDiagram";

it("uses the same int cell for indexed and arithmetic expressions", () => {
  const r=run(`#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int **marks=malloc(2*sizeof *marks);
    marks[0]=malloc(3*sizeof **marks);
    marks[1]=malloc(3*sizeof **marks);
    marks[0][0]=-300; marks[0][1]=257; marks[0][2]=901;
    marks[1][0]=70; marks[1][1]=80; marks[1][2]=91;
    int *indexed=&marks[1][1];
    int *arithmetic=*(marks+1)+1;
    printf("%d %d %d %d\\n",indexed==arithmetic,*indexed,marks[0][0],marks[0][2]);
    free(marks[0]); free(marks[1]); free(marks);
    return 0;
}
`);
  expect(r.status,r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("1 80 -300 901\n");
  const end = r.trace.steps.at(-1)!;
  const row = end.memory.allocations[2].address;
  expect(Number(end.frames[0].variables?.indexed.value)).toBe(row + 4);
  expect(Number(end.frames[0].variables?.arithmetic.value)).toBe(row + 4);
});

it("records scanf's signed int bytes and replays the actual row slots", () => {
  const r=run(`#include <stdio.h>
#include <stdlib.h>
int main(void) {
    int **marks=malloc(2*sizeof *marks);
    for (int i=0; i<2; i++) *(marks+i)=malloc(3*sizeof **marks);
    for (int i=0; i<2; i++)
        for (int j=0; j<3; j++)
            if (scanf("%d", *(marks+i)+j) != 1) return 1;
    printf("%d %d %d %d %d %d\\n",
        **marks, *(*marks+1), *(*marks+2),
        **(marks+1), *(*(marks+1)+1), *(*(marks+1)+2));
    for (int i=0; i<2; i++) free(*(marks+i));
    free(marks);
    return 0;
}
`, undefined, undefined, "-300 257 901 70 80 91");
  expect(r.status,r.error?.reason).toBe("ok");
  const filled = r.trace.steps.find(s => s.stdout === "-300 257 901 70 80 91\n")!;
  expect(filled).toBeDefined();
  const [table, first, second] = filled.memory.allocations;
  expect(readHeapMatrix(filled.memory, table.address)?.rows.map(row => ({ptr:row.slot.value,values:row.cells?.map(c=>c.value)})))
    .toEqual([{ptr:first.address,values:[-300,257,901]},{ptr:second.address,values:[70,80,91]}]);
  const address = second.address + 4;
  const written = r.trace.steps.find(s => s.memory.bytes[address] === 80)!;
  expect(r.trace.goto(written.index - 1)?.memory.shadows[address]).toBe("allocated-uninitialized");
  expect(r.trace.goto(written.index)?.memory.bytes.slice(address,address+4)).toEqual([80,0,0,0]);
  expect(r.leaks).toEqual([]);
});

it("doesn't replay either index or scanf address side effects", () => {
  const r = run(`int main(void) {
    int **m=malloc(sizeof *m); *m=malloc(2*sizeof **m);
    int row=0,col=1;
    scanf("%d", *(m+row++)+col++);
    printf("%d %d %d", row, col, *(1+*m));
    free(*m); free(m);
  }`,undefined,undefined,"513");
  expect(r.status,r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("1 2 513");
});

it.each([
  ["**(m+1)=9;", /row index out of bounds/],
  ["*(*m+2)=9;", /column index out of bounds/],
  ["*(*m-1)=9;", /column index out of bounds/],
  ["free(*m); *(*m+1)=9;", /use-after-free/],
  ["*m=NULL; **m=9;", /null matrix row pointer/],
])("does not use a different allocation in pointer notation: %s", (tail,error) => {
  const r=run(`int main(void){int **m=malloc(sizeof *m); *m=malloc(2*sizeof **m); int *next=malloc(8); ${tail}}`);
  expect(r.status).toBe("error");
  expect(r.error?.reason).toMatch(error);
});
