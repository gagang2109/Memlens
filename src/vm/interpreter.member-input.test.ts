import { expect, it } from "vitest";
import { run } from "./interpreter";

const source = (body: string, helper = "") => `struct Item { char label[5]; int count; };
  ${helper}
  int main(void) { struct Item item; item.count = 44; ${body} return 0; }`;
const execute = (body: string, input: string, helper = "") =>
  run(source(body, helper), 100000, 100, input);

it("reads a bounded word directly into a struct field and records its character cells", () => {
  const result = execute('printf("%d ", scanf("%4s %d", item.label, &item.count)); printf("%s %d", item.label, item.count);', "lime 7");
  expect(result.status, result.error?.reason).toBe("ok");
  const last = result.trace.steps.at(-1)!;
  expect(last.stdout).toBe("2 lime 7");
  expect(last.frames[0].variables?.["item.label"].array?.cells).toEqual(["l", "i", "m", "e", "\0"]);
  const before = result.trace.steps.find(step => step.frames[0]?.variables?.["item.label"]?.array?.cells.every(value => value === null))!;
  expect(result.trace.goto(before.index)?.frames[0].variables?.["item.label"].array?.cells).toEqual([null, null, null, null, null]);
});

it("writes to a field suffix passed to a helper and retains spaces with a scanset", () => {
  const result = execute("item.label[0]='!'; read(&item.label[1]); printf(\"%s %d\", item.label, item.count);", "a b\n",
    'void read(char *p) { scanf("%3[^\\n]", p); }');
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("!a b 44");
});

it("keeps raw %c data unterminated", () => {
  const result = execute('scanf("%2c", item.label); printf("%c%c", item.label[0], item.label[1]);', " R");
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe(" R");
  expect(result.trace.steps.at(-1)?.frames[0].variables?.["item.label"].array?.cells).toEqual([" ", "R", null, null, null]);
});

it("waits on incomplete interactive input without writing a partial field", () => {
  const program = source('scanf("%4s", item.label); printf("%s", item.label);');
  const waiting = run(program, 100000, 100, "li", true);
  expect(waiting.status).toBe("waiting");
  expect(waiting.trace.steps.at(-1)?.frames[0].variables?.["item.label"].array?.cells).toEqual(Array(5).fill(null));
  const resumed = run(program, 100000, 100, "lime", true);
  expect(resumed.status, resumed.error?.reason).toBe("ok");
  expect(resumed.trace.steps.at(-1)?.stdout).toBe("lime");
});

it.each([
  ['scanf("%s",item.label);', "lemon"],
  ['scanf("%4s",&item.label[1]);', "lime"],
  ['scanf("%5[^\\n]",item.label);', "a b c"],
  ['scanf("%6c",item.label);', "abcdef"],
])("rejects overflowing conversions before writing even a partial string: %s", (body, input) => {
  const result = execute(body, input);
  expect(result.error?.reason).toContain("exceeds struct character array bounds");
  const frame = result.trace.steps.at(-1)?.frames[0];
  expect(frame?.variables?.["item.label"].array?.cells).toEqual([null, null, null, null, null]);
  expect(frame?.variables?.["item.count"].value).toBe("44");
});

it("diagnoses non-character and expired field destinations", () => {
  expect(execute('scanf("%s", &item.count);', "hi").error?.reason).toContain("not inside a struct character array");
  const old = run(`struct Item { char label[5]; int count; };
    char *former(void) { struct Item item; return item.label; }
    int main(void) { scanf("%4s", former()); return 0; }`, 100000, 100, "hi");
  expect(old.error?.reason).toContain("after its function returned");
});
