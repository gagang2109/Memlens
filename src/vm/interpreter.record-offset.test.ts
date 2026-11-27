import { expect, it } from "vitest";
import { run } from "./interpreter";

const row = "struct Row { char name[5]; int roll; float mark; };\n";
it("uses the actual record addresses for decayed arrays and tracks the best pointer during rewind", () => {
  const result = run(row + `int main(void) {
  struct Row a[3];
  int i = 0;
  for (i = 0; i < 3; i++) scanf("%4s %d %f", a[i].name, &a[i].roll, &a[i].mark);
  struct Row *best = a;
  for (i = 1; i < 3; ++i) if ((a + i)->mark > best->mark) best = a + i;
  printf("%s %d %.2f", best->name, best->roll, best->mark);
  return 0;
}`, undefined, undefined, "Noa 72 80.25 Mae 19 92.5 Uma 42 90");
  expect(result.status, result.error?.reason).toBe("ok");
  const end = result.trace.steps.at(-1)!;
  expect(end.stdout).toBe("Mae 19 92.50");
  const { best } = end.frames[0].variables!;
  const initial = result.trace.steps.find(s => s.frames[0].variables?.best)!;
  const v = initial.frames[0].variables!;
  expect(v.best.storage).toBe(best.storage);
  expect(result.trace.goto(end.index)?.pointers).toContainEqual(expect.objectContaining({label:"best", to:v["a[1]"].storage}));
  expect(result.trace.goto(initial.index)?.pointers).toContainEqual(expect.objectContaining({label:"best", to:v["a[0]"].storage}));
});

it("resolves one offset evaluation, reverse movement, and matching helper calls", () => {
  const result = run(row + `void set(struct Row *a) { (a + 1)->roll = 31; }
int main(void) {
  struct Row a[3];
  int i = 1;
  struct Row *p = i++ + a;
  (p - 1)->roll = 14;
  set(p);
  struct Row *q = &a[2];
  q = q - 2;
  printf("%d %d %d %d", i, q->roll, a[2].roll, (a + 1)->roll = 40);
  return 0;
}`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("2 14 31 40");
});

it.each([
  ["struct Row *p = a + 2;", "record pointer index out of bounds"],
  ["struct Row *p = a - 1;", "record pointer index out of bounds"],
  ["(a + 2)->roll = 2;", "record pointer index out of bounds"],
  ["struct Row *p = a + 1.0;", "offset requires a supported integer"],
  ["struct Row *p = a + a;", "arithmetic between two record pointers"],
  ["struct Row *p = NULL; p = p + 1;", "cannot offset a null"],
  ["struct Row object; struct Row *p = &object; p = p + 1;", "original local record array"],
  ["int *other; struct Row *p = a + other;", "offset requires a supported integer"],
])("diagnoses offset %s", (body, message) => {
  const result = run(row + `int main(void) { struct Row a[2], next[2]; ${body} return 0; }`);
  expect(result.error?.reason).toContain(message);
});

it("rejects an offset from storage belonging to a returned helper", () => {
  const result = run(row + `struct Row *saved;
void remember(void) { struct Row a[2]; saved = a; }
int main(void) { remember(); struct Row live[2]; saved = saved + 1; return 0; }`);
  expect(result.error?.reason).toContain("after its target function returned");
});

it("sizes a field without running the offset", () => {
  const result = run(row + `int main(void) { struct Row a[2]; int i = 0;
  printf("%zu %d", sizeof((a + i++)->name), i); return 0; }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("5 0");
});
