import { describe, expect, it } from "vitest";
import { run } from "./interpreter";

const row = "struct Row { char name[4]; int id; float mark; };";
const resultFor = (code: string, input = "") => run(row + "\n" + code, 100000, 100, input);
const varsAt = (result: ReturnType<typeof run>, index: number) =>
  result.trace.steps[index].frames.find(frame => frame.name === "main")?.variables;

describe("pointers to bounded local records", () => {
  it("tracks a highest-mark selection at the original array addresses through rewind", () => {
    const result = resultFor(`
    void read_rows(struct Row *a, int n) {
      for (int i = 0; i < n; ++i) scanf("%3s%d%f", a[i].name, &a[i].id, &a[i].mark);
    }
    int main(void) {
      struct Row a[3]; read_rows(a, 3);
      struct Row *best = &a[0];
      for (int i = 1; i < 3; ++i) if (a[i].mark > best->mark) best = &a[i];
      printf("%s %d %.2f\\n", best->name, best->id, best->mark);
      return 0;
    }`, "Ari 21 88.125 Bo 12 88.875 Cy 10 80.5");
    expect(result.error).toBeUndefined();
    expect(result.trace.steps.at(-1)?.stdout).toBe("Bo 12 88.88\n");
    const first = result.trace.steps.findIndex((_, index) => varsAt(result, index)?.best?.value === String(varsAt(result, index)?.["a[0]"]?.storage));
    const next = result.trace.steps.findIndex((_, index) => varsAt(result, index)?.best?.value === String(varsAt(result, index)?.["a[1]"]?.storage));
    expect(first).toBeGreaterThan(0);
    expect(next).toBeGreaterThan(first);
    const old = varsAt(result, first)!, updated = varsAt(result, next)!;
    expect(updated.best.storage).toBe(old.best.storage);
    expect(updated.best.value).not.toBe(old.best.value);
    expect(result.trace.goto(first)?.pointers).toContainEqual(expect.objectContaining({ label: "best", to: old["a[0]"].storage }));
    expect(result.trace.goto(next)?.pointers).toContainEqual(expect.objectContaining({ label: "best", to: old["a[1]"].storage }));
  });

  it("keeps one evaluation of an index, supports same-type alias and writes through a helper", () => {
    const result = resultFor(`
    void change(struct Row *p) { p->mark = 4.5; }
    int main(void) {
      struct Row a[2]; int i = 0;
      struct Row *p = &a[i++];
      struct Row *q = p;
      change(q); q = NULL;
      printf("%d %d %.1f", i, q == NULL, a[0].mark);
      return 0;
    }`);
    expect(result.error).toBeUndefined();
    expect(result.trace.steps.at(-1)?.stdout).toBe("1 1 4.5");
  });

  it.each([
    ["struct Row *p = &a[2];", "record array index out of bounds"],
    ["struct Row *p = (struct Row *)1048576;","record pointer requires"],
    ["struct Other *p = &a[0];", "record pointer requires"],
    ["struct Row *p = &a[0]; p++;", "record pointers only support direct rebinding"],
    ["struct Row *p = &a[0]; p = p + 1;", "record pointer requires"],
    ["struct Row *p = &a[0]; printf(\"%d\", p[0].id);", "indexed access through a record pointer is not supported"],
    ["struct Row *p = NULL; p->id = 7;", "null pointer dereference"],
    ["struct Row *p; p->id = 7;", "uninitialized record pointer"],
    ["struct Row *p = &a[0]; printf(\"%d\", p.id);", "use '->'"],
  ])("rejects unsupported or invalid access: %s", (body, expected) => {
    const result = resultFor(`struct Other { char name[4]; }; int main(void) { struct Row a[2]; ${body} return 0; }`);
    expect(result.error?.reason).toContain(expected);
  });

  it("diagnoses a saved address after the target call returns instead of reading another record", () => {
    const result = resultFor(`
    struct Row *saved;
    void select(void) { struct Row a[2]; a[1].id = 7; saved = &a[1]; }
    int main(void) { select(); printf("%d", saved->id); return 0; }`);
    expect(result.error?.reason).toContain("record pointer used after its target function returned");
    expect(result.trace.steps.at(-1)?.pointers).toContainEqual(expect.objectContaining({ label: "saved", dangling: true }));
  });
});
