import { expect, it } from "vitest";
import { run } from "./interpreter";

it("compares fractional marks in indexed records and rewinds float field edits", () => {
  const result = run(`struct Row { char name[4]; int roll; float marks; };
    int main(void) {
      struct Row rows[3];
      rows[0].marks = 88.125f;
      rows[1].marks = 88.875f;
      rows[2].marks = 80.5f;
      int best = 0;
      for (int i=1; i<3; ++i) if (rows[i].marks > rows[best].marks) best = i;
      printf("%d %.3f %.4f %zu", best, rows[best].marks, rows[0].marks / 2, sizeof rows[best].marks);
      rows[best].marks = 79.5f;
      return 0;
    }`);
  expect(result.status, result.error?.reason).toBe("ok");
  const end = result.trace.steps.at(-1)!;
  expect(end.stdout).toBe("1 88.875 44.0625 4");
  const after = end.frames[0].variables!;
  const earlier = result.trace.steps.find(step => step.frames[0].variables?.["rows[1].marks"]?.value === "88.875")!;
  const restored = result.trace.goto(earlier.index)?.frames[0].variables?.["rows[1].marks"];
  expect(restored).toMatchObject({ value: "88.875", type: "float", storage: after["rows[1].marks"].storage });
  expect(after["rows[1].marks"].value).toBe("79.5");
});

it("stores single-precision values and preserves them through a whole-record copy", () => {
  const result = run(`struct Row { char name[5]; float marks; };
    int main(void) {
      struct Row source;
      source.marks = 16777217.0;
      struct Row target = source;
      source.marks = 0;
      printf("%.0f %zu", target.marks, sizeof target);
      return 0;
    }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("16777216 12");
});

it.each([
  ['printf("%f", row.marks);', "uninitialized read"],
  ["row.marks = 3.5e38;", "outside the supported finite float range"],
  ['scanf("%d", &row.marks);', "cannot read into a float record field"],
  ['scanf("%f", &row.marks);', "unsupported scanf conversion"],
])("keeps unsupported uses explicit: %s", (body, diagnostic) => {
  const result = run(`struct Row { char name[4]; float marks; };
    int main(void) { struct Row row; ${body} return 0; }`, 100000, 100, "19");
  expect(result.error?.reason).toContain(diagnostic);
});
