import { expect, it } from "vitest";
import { run } from "./interpreter";

it("keeps sparse-matrix triplet initializers and transposed writes in contiguous local storage", () => {
  const r = run(`struct Term { int row, col, value; };
int main(void) {
  struct Term source[3] = {{0, 2, 19}, {1, 0, -31}, {2, 1, 257}}, transpose[3];
  int next = 0;
  for (int col = 0; col < 3; col++) {
    for (int i = 0; i < 3; i++) {
      if (source[i].col == col) {
        transpose[next].row = source[i].col;
        transpose[next].col = source[i].row;
        transpose[next++].value = source[i].value;
      }
    }
  }
  for (int i = 0; i < 3; i++)
    printf("%d %d %d|", transpose[i].row, transpose[i].col, transpose[i].value);
  return 0;
}`);
  expect(r.status, r.error?.reason).toBe("ok");
  const end = r.trace.steps.at(-1)!;
  expect(end.stdout).toBe("0 1 -31|1 2 257|2 0 19|");
  expect(r.leaks).toEqual([]);
  expect(end.memory.allocations).toEqual([]);
  const vars = end.frames[0].variables!;
  expect(vars["source[1]"].storage! - vars["source[0]"].storage!).toBe(12);
  expect(vars["source[0].value"].storage! - vars["source[0]"].storage!).toBe(8);
  const at = r.trace.steps.findIndex(s => s.frames[0].variables?.["transpose[1].value"]?.value === "257");
  expect(at).toBeGreaterThan(0);
  expect(r.trace.goto(at)?.frames[0].variables?.["transpose[1].value"]?.value).toBe("257");
  expect(r.trace.goto(at - 1)?.frames[0].variables?.["transpose[1].value"]?.value).toBe("uninitialized");
  expect(r.trace.goto(at - 1)?.frames[0].variables?.["source[2].value"]?.value).toBe("257");
});

it("preserves declared order, infers row count, and zeroes omitted fields or records", () => {
  const r = run(`struct Term { int z, a, m; };
int main(void) {
  struct Term partial[3] = {{1,5}, {-2},};
  struct Term inferred[] = {7, 8, 9, 10};
  printf("%d %d %d %d %d %d %d %zu %zu %zu",
    partial[0].a, partial[0].m, partial[1].z, partial[1].m, partial[2].z,
    inferred[1].z, inferred[1].a, sizeof partial, sizeof inferred[0],
    sizeof inferred[0].m);
  return 0;
}`);
  expect(r.status, r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("5 0 -2 0 0 10 0 36 12 4");
});

it("uses the caller's int record slots through a typed helper", () => {
  const r = run(`struct Pair { int a, b; };
void sum(struct Pair p[]) { p[1].b = p[0].a + p[0].b; }
int main(void) {
  struct Pair p[2] = {{6,9}, {1}};
  sum(p);
  printf("%d %d", p[1].a, p[1].b);
  return 0;
}`);
  expect(r.status, r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("1 15");
});

it.each([
  ["struct Term rows[1] = {{1,2,3,4}};", "invalid-c", "too many values"],
  ["struct Term rows[1] = {{1}, {2}};", "invalid-c", "too many records"],
  ["struct Term rows[2] = {{1}, 2};", "unsupported-c", "flat list"],
  ["struct Term rows[2] = {{.row = 1}};", "unsupported-c", "designated record initializers"],
  ["struct Term rows[2] = {{1.5}};", "unsupported-c", "requires supported integer"],
  ["struct Node rows[2] = {{0}};", "unsupported-c", "brace initialization"],
])("diagnoses unsupported or malformed input instead of corrupting record addresses: %s", (body, kind, message) => {
  const r = run(`struct Term { int row, col, value; };
struct Node { int data; struct Node *next; };
int main(void) {
  ${body}
  return 0;
}`);
  expect(r.error?.line).toBe(4);
  expect(r.error?.diagnosticKind).toBe(kind);
  expect(r.error?.reason).toContain(message);
  expect(r.trace.steps.at(-1)?.memory.allocations).toEqual([]);
});


it("preserves execution of older non-initialized dynamic record arrays", () => {
  const r = run(`struct Term { int row, col, value; };
int main(void) {
  int n = 4;
  struct Term rows[n];
  rows[3].value = 17;
  printf("%d", rows[3].value);
  return 0;
}`);
  expect(r.status, r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("17");
});
