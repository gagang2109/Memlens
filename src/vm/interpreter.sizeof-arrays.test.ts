import { expect, it } from "vitest";
import { run } from "./interpreter";

it.each([
  ["int a[3];", "sizeof(a)", "12"],
  ["int a[2][3];", "sizeof a", "24"],
  ["int a[2][3];", "sizeof(*a)", "12"],
  ["int a[2][3];", "sizeof(a[0][99])", "4"],
  ['char a[]="abc";', "sizeof(a)", "4"],
  ["const char a[2][3][4];", "sizeof(a[1][0])", "4"],
  ["int a[2][3]; unsigned int i=0;", "sizeof(a[i])", "12"],
  ["int a[2][3]; int idx[2]={0,1};", "sizeof(a[idx[1]])", "12"],
])("sizes supported fixed arrays: %s %s", (setup, operand, expected) => {
  const result = run(`int main(void) { ${setup} printf("%d", ${operand}); }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
});

it("does not evaluate an index or a known integer-returning call", () => {
  const result = run(`int calls=0; int next(void){ calls++; return 0; }
    int main(void){ int a[2][3]; int i=0; int row=sizeof(a[i++]); int cell=sizeof(a[99][next()]); printf("%d %d %d %d",row,cell,i,calls); }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("12 4 0 0");
});

it.each(["missing", '"x"', "2.0", "missing()", 'idx["x"]', "(missing,0)", "floatIndex", "p"])("diagnoses invalid or unsupported array subscript %s without evaluating it", index => {
  const result = run(`int main(void) {
    int a[2][3], idx[2]={0,1}; float floatIndex=0; int *p=&idx[0];
    printf("%d", sizeof(a[${index}]));
  }`);
  expect(result.status).toBe("error");
  expect(result.error?.reason).toContain("sizeof array index");
  expect(result.error?.line).toBe(3);
});

it("rejects extra bracket levels instead of quietly falling back", () => {
  const result = run('int main(void){ int a[2][3]; printf("%d",sizeof(a[0][0][0])); }');
  expect(result.error?.reason).toContain("too many subscripts");
});

it("uses the original runtime size without evaluating the bound again", () => {
  const result = run(`#include <stdio.h>
  int calls=0;
  int bound(int count){ calls++; return count; }
  int main(void) {
    int n; scanf("%d", &n); int a[bound(n)];
    int bytes = sizeof a; n=99;
    printf("%d %d %d %d", bytes, (int)sizeof(a), n, calls);
  }`, 100000, 100, "3");
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("12 12 99 1");
});
it("handles a named runtime matrix and character buffer", () => {
  const result = run(`int main(void) {
    int rows=2, cols=3;
    int a[rows][cols]; char text[cols+1];
    printf("%d %d", (int)sizeof a, (int)sizeof text);
  }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("24 4");
});
it("does not guess the evaluation rules for a variable-length row operand", () => {
  const result = run('int main(void){ int n=3; int a[2][n]; printf("%d", (int)sizeof(a[0])); }');
  expect(result.error?.reason).toContain("variable-length");
});

it("keeps struct pointee allocations separate from fixed-array logic", () => {
  const result = run('typedef struct Node { int value; struct Node *next; } Node; int main(void){ Node *p=malloc(sizeof *p); p->value=5; printf("%d", p->value); free(p); }');
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("5");
  expect(result.trace.steps.at(-1)?.memory.allocations[0]?.size).toBe(16);
});

it.each(['helper("x")', 'readOnly++', 'helper()', 'idx[0][1]'])("validates nested sizeof index %s", index => {
  const result = run(`int helper(int x){ return x; }
    int main(void){ int a[2][3], idx[2]={0,1}; const int readOnly=0; printf("%d",sizeof(a[${index}])); }`);
  expect(result.error?.reason).toContain("sizeof array index");
});
it("uses fixed integer constants and preserves array scope", () => {
  const result = run(`#define ROWS 2
#define COLS 3
  int a[ROWS][COLS]; int size(void){ char a[2*3]; return sizeof a; }
  int main(void){ printf("%d %d %d",sizeof a,sizeof *a,size()); }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("24 12 6");
});
