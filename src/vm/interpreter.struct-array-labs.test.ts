import { expect, it } from "vitest";
import { run } from "./interpreter";

it("uses the same fixed array when a queue is passed by pointer and when it is accessed directly", () => {
  const result = run(`#include <stdio.h>
#define CAP 4
struct Bin { int elements[CAP]; int first, last; };
void add(struct Bin *q, int value) { q->elements[++q->last] = value; }
int removeFirst(struct Bin *q) { return q->elements[q->first++]; }
int main(void) {
  struct Bin q, other;
  q.first=0; q.last=-1; other.first=0; other.last=-1;
  add(&q, 19); add(&q, 32); add(&other, 71);
  printf("%d %d ", q.last, q.elements[1]);
  printf("%d ", removeFirst(&q));
  printf("%d %d", q.first, other.elements[0]);
  return 0;
}`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("1 32 19 1 71");
  const firstWrite = result.trace.steps.findIndex(step => step.frames[0].variables?.["q.elements"]?.array?.cells[0] === 19);
  expect(firstWrite).toBeGreaterThan(0);
  expect(result.trace.goto(firstWrite)?.frames[0].variables?.["q.elements"]?.array?.cells).toEqual([19, null, null, null]);
  expect(result.trace.goto(firstWrite - 1)?.frames[0].variables?.["q.elements"]?.array?.cells).toEqual([null, null, null, null]);
});

it("keeps a struct's fixed array bound separate from its adjacent fields", () => {
  const result = run(`struct Bin { int items[3]; int rear; };
int main(void) { struct Bin q; q.rear=2; q.items[3]=99; return 0; }`);
  expect(result.status).toBe("error");
  expect(result.error?.reason).toMatch(/(?:member|items).*out of bounds/i);
});

it("passes a fixed array member to a helper without copying it", () => {
  const result = run(`#include <stdio.h>
struct Bin { int items[3]; int rear; };
void change(int *a) { *a=44; a[1]=123; }
int main(void) { struct Bin q; q.items[1]=8; change(q.items); int *p=&q.items[1]; printf("%d %d",q.items[0],*p); return 0; }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("44 123");
});

it("computes int array member sizes without evaluating their subscripts", () => {
  const r = run(`struct Q { int data[5]; int front, rear; };
  int main(void) { struct Q q; struct Q *p=&q; int i=0;
    printf("%zu %zu %zu %zu %zu %d",sizeof(struct Q),sizeof q,sizeof *p,sizeof(p->data),sizeof(q.data[i++]),i);
    return 0;
  }`);
  expect(r.status, r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("28 28 28 20 4 0");
});

it.each([
  ["struct Q q={0};", /whole-struct initializer/],
  ["struct Q a[2]={0};", /whole-struct initializer/],
  ["static struct Q q;", /non-static/],
  ["{ struct Q q[2]; }", /record arrays must be directly in a function body/],
  ["struct Q q; int x=q.items[0];", /uninitialized read/],
  ["struct Q q; q=3;", /record copy requires/],
  ["struct Q *q=malloc(sizeof(struct Q)); q->items[0]=1;", /only on local struct/],
])("does not silently simulate an unsupported or invalid use: %s", (body, reason) => {
  const r = run(`struct Q { int items[3]; int rear; }; int main(void) { ${body} return 0; }`);
  expect(r.status).toBe("error");
  expect(r.error?.reason).toMatch(reason);
});

it("does not leave a helper's struct array usable after return", () => {
  const r = run(`struct Q { int items[3]; }; int *escaped(void) { struct Q q; q.items[0]=17; return q.items; }
  int main(void) { int *p=escaped(); printf("%d",p[0]); return 0; }`);
  expect(r.status).toBe("error");
  expect(r.error?.reason).toContain("after its function returned");
});

it("rejects non-integer or unreasonably large member bounds before execution", () => {
  const make = (size: string) => run(`#define CAP ${size}
struct Q { int items[CAP]; }; int main(void) { return 0; }`);
  expect(make(".2e1").error?.reason).toContain("positive integer");
  expect(make("0").error?.reason).toContain("positive integer");
  expect(make("65536").error?.reason).toContain("exceeds simulator limit");
});

it("links adjacent byte-sized char cells and preserves padded int field offsets", () => {
  const result = run(`struct Brackets { char entries[3]; int top; char spare[1]; };
  void put(char *entries) { entries[0]='('; entries[1]='['; }
  int main(void) {
    struct Brackets s; s.top=1;
    put(s.entries);
    char *p=&s.entries[1]; *p=')';
    printf("%zu %zu %zu %d %c", sizeof s, sizeof s.entries, sizeof(s.entries[s.top++]), s.top, s.entries[1]);
    return 0;
  }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("12 3 1 1 )");
  const v = result.trace.steps.at(-1)?.frames[0].variables;
  expect(v?.["s.entries"].type).toBe("char[3]");
  expect(v?.["s.entries"].array?.cells).toEqual(["(", ")", null]);
  expect(v?.["s.top"].storage! - v?.["s.entries"].storage!).toBe(4);
  expect(v?.["s.spare"].storage! - v?.["s.entries"].storage!).toBe(8);
});

it.each([
  ["s.entries[3]='x';", /out of bounds/],
  ["char c=s.entries[0];", /uninitialized read/],
])("keeps character members bounded and tracks unwritten cells: %s", (use, reason) => {
  const result = run(`struct S { char entries[3]; int top; };
  int main(void) { struct S s; ${use} return 0; }`);
  expect(result.status).toBe("error");
  expect(result.error?.reason).toMatch(reason);
});
