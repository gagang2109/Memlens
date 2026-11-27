import { expect, it } from "vitest";
import { SIM_POINTER_BYTES } from "../lang/parser";
import { run } from "./interpreter";

const fixture = (parameter: string) => `struct Row { char name[4]; int score; };
  void sort(${parameter}) {
    struct Row temp;
    if (a[0].score < a[1].score) {
      temp = a[0];
      a[0] = a[1];
      a[1] = temp;
    }
  }
  int main(void) {
    struct Row rows[2];
    scanf("%3s%d%3s%d", rows[0].name, &rows[0].score, rows[1].name, &rows[1].score);
    sort(rows);
    printf("%s/%d %s/%d", rows[0].name, rows[0].score, rows[1].name, rows[1].score);
    return 0;
  }`;

it.each(["struct Row a[]", "struct Row *a"])("sorts the caller's records through %s with a pointer-only helper frame", parameter => {
  const result = run(fixture(parameter), 100000, 100, "Jet 48 Sky 83");
  expect(result.status, result.error?.reason).toBe("ok");
  const end = result.trace.steps.at(-1)!;
  expect(end.stdout).toBe("Sky/83 Jet/48");
  const recordNames = (step: typeof end) => [0, 1].map(i =>
    step.frames[0]?.variables?.[`rows[${i}].name`]?.array?.cells.join(""));
  const inside = result.trace.steps.find(step => step.frames.at(-1)?.name === "sort" && recordNames(step).join("/") === "Sky\0/Sky\0")!;
  expect(inside).toBeDefined();
  const callee = inside.frames.at(-1)!.variables!;
  const base = end.frames[0].variables!.rows.storage!;
  expect(callee.a).toMatchObject({ value: String(base), pointer: true });
  expect(callee["a[0]"]).toBeUndefined();
  expect(inside.pointers).toContainEqual({ from: "sort.a", to: base, label: "a", dangling: false });
  expect(inside.frames[0].variables?.["rows[1].score"].storage).toBe(end.frames[0].variables?.["rows[1].score"].storage);
  expect(end.frames.some(frame => frame.name === "sort")).toBe(false);
  expect(recordNames(result.trace.goto(inside.index)!)).toEqual(["Sky\0", "Sky\0"]);
});

it("forwards the same bounds and distinguishes sizeof pointer from sizeof record", () => {
  const result = run(`struct Row { char name[6]; int score; };
    void finish(struct Row *a) {
      int i=0;
      a[1].score = 71;
      printf("%zu %zu %zu %d ", sizeof a, sizeof a[i++], sizeof a[i++].name, i);
    }
    void forward(struct Row a[]) { finish(a); }
    int main(void) { struct Row rows[2]; forward(rows); printf("%d", rows[1].score); return 0; }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe(`${SIM_POINTER_BYTES} 12 6 0 71`);
});

it.each([
  ["a[2].score = 1;", "record array index out of bounds"],
  ["a[-1].name[0] = 'x';", "record array index out of bounds"],
  ["a++;", "borrowed record array"],
])("does not escape caller bounds or rebind a borrowed record array: %s", (body, error) => {
  const result = run(`struct Row { char name[4]; int score; };
    void bad(struct Row a[]) { ${body} }
    int main(void) { struct Row rows[2]; bad(rows); return 0; }`);
  expect(result.error?.reason).toContain(error);
});

it("requires a same-type one-level pointer parameter", () => {
  const result = run(`struct Row { char name[4]; int score; };
    struct Other { char name[4]; int score; };
    void bad(struct Other *a) {}
    int main(void) { struct Row rows[2]; bad(rows); return 0; }`);
  expect(result.error?.reason).toContain("matching single-pointer parameter");
});
