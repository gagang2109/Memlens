import fixture from "../../tests/labs/record-sort/scoped-swap.c?raw";
import { expect, it } from "vitest";
import { run } from "./interpreter";

it("sorts pasted records using a temporary whose scope and history match the swap block", () => {
  const result = run(fixture, 100000, 100, "Mia 31 B Ada 14 A Eli 23 C");
  expect(result.status, result.error?.reason).toBe("ok");
  const last = result.trace.steps.at(-1)!;
  expect(last.stdout).toBe("temp=99\ntemp=99\n14 Ada A\n23 Eli C\n31 Mia B\n");
  const vars = (step: typeof last) => step.frames[0].variables!;
  const rolls = (step: typeof last) => [0, 1, 2].map(i => vars(step)[`rows[${i}].roll`]?.value).join(",");
  const firstSwap = result.trace.steps.find(step => rolls(step) === "14,14,23")!;
  const secondSwap = result.trace.steps.find(step => rolls(step) === "14,23,23")!;
  expect(firstSwap.index).toBeLessThan(secondSwap.index);
  expect(vars(firstSwap).temp.storage).not.toBe(vars(secondSwap).temp.storage);
  for (const [step, history] of [[secondSwap, "14,23,23"], [firstSwap, "14,14,23"]] as const) {
    const rewound = result.trace.goto(step.index)!;
    expect(rolls(rewound)).toBe(history);
    expect(vars(rewound)["temp.roll"].value).toBe("31");
    expect(vars(rewound)["temp.grade"].value).toBe("B");
    for (const i of [0, 1, 2])
      expect(vars(rewound)[`rows[${i}]`].storage).toBe(vars(last)[`rows[${i}]`].storage);
  }
  const outsideLine = fixture.split("\n").findIndex(line => line.includes('printf("temp=%d')) + 1;
  const outside = result.trace.steps.filter(step => step.line === outsideLine);
  for (const step of outside) {
    expect(vars(step).temp.value).toBe("99");
    expect(vars(step)["temp.roll"]).toBeUndefined();
  }
  expect(outside).toHaveLength(2);
  expect(vars(last).temp.value).toBe("99");
});

it("restores block bindings after continues, breaks and a helper returns", () => {
  const result = run(`struct Row { int items[3]; int roll; };
    int value(struct Row *p) { return p->roll; }
    int helper(int stop) {
      int temp = 99;
      for (int i = 0; i < 4; i++) {
        struct Row temp;
        temp.roll = 20 + i;
        if (i == 0) continue;
        if (stop && i == 1) return value(&temp);
        if (i == 2) break;
      }
      return temp;
    }
    int main(void) { printf("%d %d", helper(1), helper(0)); return 0; }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("21 99");
  expect(result.trace.steps.at(-1)?.frames).toHaveLength(1);
});

it("does not allow an escaped record pointer to see the current iteration's object", () => {
  const result = run(`struct Row { int items[3]; int roll; };
    int main(void) {
      struct Row *saved = 0;
      for (int i = 0; i < 2; i++) {
        struct Row temp;
        temp.roll = i;
        if (i == 0) { saved = &temp; continue; }
        printf("%d", saved->roll);
      }
      return 0;
    }`);
  expect(result.error?.reason).toContain("record pointer used after its target block ended");
  expect(result.trace.steps.at(-1)?.pointers?.find(p => p.label === "saved")?.dangling).toBe(true);
  expect(result.trace.steps.at(-1)?.frames[0].variables?.["temp.roll"].value).toBe("1");
});

it("checks the lifetime of a character-array alias into a block local", () => {
  const result = run(`struct Row { char label[4]; };
    int main(void) {
      char *saved;
      { struct Row temp; temp.label[0] = 'A'; temp.label[1] = 0; saved = temp.label; }
      printf("%s", saved);
      return 0;
    }`);
  expect(result.error?.reason).toContain("struct member used after its block ended");
  expect(result.trace.steps.at(-1)?.frames[0].variables?.temp).toBeUndefined();
});

it("distinguishes a duplicate name in one block from a nested shadow", () => {
  const r = run(`struct Row { int items[2]; }; int main(void) { { int temp = 99; struct Row temp; } }`);
  expect(r.error?.diagnosticKind).toBe("invalid-c");
  expect(r.error?.reason).toContain("duplicate declaration");
  const good = run(`struct Row { int items[2]; int roll; };
    int main(void) {
      { struct Row temp; temp.roll = 3;
        { struct Row temp; temp.roll = 7; printf("%d ", temp.roll); }
        printf("%d", temp.roll);
      }
      return 0;
    }`);
  expect(good.status, good.error?.reason).toBe("ok");
  expect(good.trace.steps.at(-1)?.stdout).toBe("7 3");
});

it("keeps hidden outer array storage accessible by address", () => {
  const result = run(`struct Row { int items[2]; };
    int main(void) {
      int count[2] = {12, 15};
      int *p = &count[1];
      char label[5] = "Ada";
      char *alias = label;
      { struct Row count, label; printf("%d %s ", *p, alias); *p = 25; }
      printf("%d %s", count[1], label);
      return 0;
    }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("15 Ada 25 Ada");
});
