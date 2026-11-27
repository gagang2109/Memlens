import { expect, it } from "vitest";
import { run } from "./interpreter";

it("swaps indexed record values without moving the slots and rewinds the temporary duplicate", () => {
  const result = run(`struct Row { char name[4]; int score; };
    int main(void) {
      struct Row rows[2];
      scanf("%3s %d %3s %d", rows[0].name, &rows[0].score, rows[1].name, &rows[1].score);
      struct Row temporary = rows[0];
      rows[0] = rows[1];
      rows[1] = temporary;
      rows[0].name[0] = 'E';
      rows[1].name[0] = 'T';
      printf("%s/%d %s/%d %s/%d", rows[0].name, rows[0].score, rows[1].name, rows[1].score, temporary.name, temporary.score);
      return 0;
    }`, 100000, 100, "Mia 61 Ada 94");
  expect(result.status, result.error?.reason).toBe("ok");
  const end = result.trace.steps.at(-1)!;
  expect(end.stdout).toBe("Eda/94 Tia/61 Mia/61");
  const fields = (step: typeof end) => step.frames[0].variables!;
  const names = (step: typeof end) => [0, 1].map(i => fields(step)[`rows[${i}].name`]?.array?.cells.join(""));
  const initial = result.trace.steps.find(step => names(step).join("/") === "Mia\0/Ada\0")!;
  const duplicate = result.trace.steps.find(step => names(step).join("/") === "Ada\0/Ada\0")!;
  const swapped = result.trace.steps.find(step => names(step).join("/") === "Ada\0/Mia\0")!;
  expect(initial.index).toBeLessThan(duplicate.index);
  expect(duplicate.index).toBeLessThan(swapped.index);
  for (const step of [swapped, duplicate, initial]) {
    const rewound = result.trace.goto(step.index)!;
    expect(names(rewound)).toEqual(names(step));
    for (const key of ["rows[0]", "rows[1]", "rows[0].name", "rows[1].score"])
      expect(fields(rewound)[key].storage).toBe(fields(end)[key].storage);
  }
});

it("copies entire fixed arrays, including initialized cells after NUL", () => {
  const result = run(`struct Part { char label[6]; int state[2]; int cost; };
    int main(void) {
      struct Part src, dst;
      scanf("%5s %5s %5s", src.label, src.label, dst.label);
      src.cost = 21;
      src.state[0] = 7;
      dst.state[1] = 99;
      dst = src;
      src.label[3] = 'x';
      src.state[0] = 9;
      printf("%s %c%c %d %d", dst.label, dst.label[3], dst.label[4], dst.state[0], dst.cost);
      return 0;
    }`, 100000, 100, "Maple Li Cedar");
  expect(result.status, result.error?.reason).toBe("ok");
  const end = result.trace.steps.at(-1)!;
  expect(end.stdout).toBe("Li le 7 21");
  expect(end.frames[0].variables?.["dst.label"].array?.cells).toEqual(["L", "i", "\0", "l", "e", "\0"]);
  expect(end.frames[0].variables?.["dst.state"].array?.cells).toEqual([7, null]);
  const before = result.trace.steps.find(step => step.frames[0].variables?.["dst.label"]?.array?.cells.join("") === "Cedar\0")!;
  expect(result.trace.goto(before.index)?.frames[0].variables?.["dst.label"].array?.cells.join("")).toBe("Cedar\0");
});

it("evaluates each record subscript once and handles self-assignment", () => {
  const result = run(`struct Row { char label[4]; int score; };
    int main(void) {
      struct Row rows[2];
      int left = 0, right = 1;
      rows[1].score = 8;
      rows[left++] = rows[right--];
      rows[0] = rows[0];
      printf("%d %d %d", rows[0].score, left, right);
      return 0;
    }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("8 1 0");
});

it.each(["target = 42;", "target = wrong;", "target = &target;", "struct Row other = wrong;"])("rejects nonmatching copy operands: %s", body => {
  const result = run(`struct Row { char label[4]; int score; };
    struct Other { char label[4]; int score; };
    int main(void) { struct Row target; struct Other wrong; ${body} return 0; }`);
  expect(result.error?.reason).toContain("record copy requires two local records of the same type");
});

it("rejects an out-of-range source without changing the destination", () => {
  const result = run(`struct Row { char label[4]; int score; };
    int main(void) {
      struct Row rows[2];
      rows[0].score = 42;
      rows[0] = rows[2];
      return 0;
    }`);
  expect(result.error?.reason).toContain("record array index out of bounds");
  expect(result.trace.steps.at(-1)?.frames[0].variables?.["rows[0].score"].value).toBe("42");
});
