import { expect, it } from "vitest";
import { run } from "./interpreter";

const source = (body: string) => `struct Row { char label[4]; int score; };
  int main(void) { struct Row rows[2]; ${body} return 0; }`;

it("keeps two records in consecutive slots and rewinds an edit to just one", () => {
  const result = run(source(`
    int scanned = scanf("%3s %d %3s %d", rows[0].label, &rows[0].score, rows[1].label, &rows[1].score);
    printf("%d %s/%d %s/%d", scanned, rows[0].label, rows[0].score, rows[1].label, rows[1].score);
    rows[1].label[0] = 'P';
    printf(" %s %s", rows[0].label, rows[1].label);
  `), 100000, 100, "oak 12 elm 24");
  expect(result.status, result.error?.reason).toBe("ok");
  const end = result.trace.steps.at(-1)!;
  expect(end.stdout).toBe("4 oak/12 elm/24 oak Plm");
  expect(end.memory.allocations).toEqual([]);
  const fields = end.frames[0].variables!;
  expect(fields["rows[1]"].storage! - fields["rows[0]"].storage!).toBe(8);
  expect(fields["rows[0].score"].storage! - fields["rows[0].label"].storage!).toBe(4);
  expect(fields["rows[0].label"].array?.cells).toEqual(["o", "a", "k", "\0"]);
  expect(fields["rows[1].label"].array?.cells).toEqual(["P", "l", "m", "\0"]);
  const before = result.trace.steps.find(step => step.stdout === "4 oak/12 elm/24")!;
  const restored = result.trace.goto(before.index)!.frames[0].variables!;
  expect(restored["rows[1].label"].array?.cells).toEqual(["e", "l", "m", "\0"]);
  expect(restored["rows[1].label"].storage).toBe(fields["rows[1].label"].storage);
});

it("applies a member subscript once and keeps sizeof operands unevaluated", () => {
  const result = run(source(`
    int i = 0;
    rows[i++].score = 30;
    printf("%zu %zu %zu %zu %d %d", sizeof rows, sizeof rows[i++], sizeof rows[i++].label,
      sizeof rows[i++].label[i++], i, rows[0].score);
  `));
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("16 8 4 1 1 30");
});

it.each(["rows[-1].score = 1;", "rows[2].label[0] = 'A';"])("rejects out-of-range subscript %s", (body) => {
  const result = run(source(body));
  expect(result.error?.reason).toContain("record array index out of bounds");
});

it.each(["rows[1.5].score = 1;", "rows[1.0].score = 1;", "sizeof rows[1.0].score;"])("rejects a floating index even when integral-valued: %s", (body) => {
  expect(run(source(body)).error?.reason).toContain("index must be an integer");
});

it("keeps integer array fields distinct between records too", () => {
  const result = run(`struct Row { int values[3]; int score; };
    int main(void) {
      struct Row rows[2];
      rows[0].values[1] = 20;
      rows[1].values[1] = 40;
      printf("%d %d", rows[0].values[1], rows[1].values[1]);
      return 0;
    }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("20 40");
});

it("rejects a write into the next slot without partially filling the current one", () => {
  const result = run(source('scanf("%4s", rows[0].label);'), 100000, 100, "pine");
  expect(result.error?.reason).toContain("exceeds struct character array bounds");
  const fields = result.trace.steps.at(-1)?.frames[0].variables;
  expect(fields?.["rows[0].label"].array?.cells).toEqual(Array(4).fill(null));
  expect(fields?.["rows[1].label"].array?.cells).toEqual(Array(4).fill(null));
});

it("rejects an escaped buffer after its record array owner returns", () => {
  const result = run(`struct Row { char label[4]; int score; };
    char *expired(void) { struct Row rows[2]; return rows[1].label; }
    int main(void) { scanf("%3s", expired()); return 0; }`, 100000, 100, "fir");
  expect(result.error?.reason).toContain("after its function returned");
});

it.each([
  ["rows[0] = rows[1];", "whole-record"],
  ["int n = 2; struct Row other[n];", "fixed one-dimensional"],
  ["struct Row other[2][2];", "fixed one-dimensional"],
  ["struct Row other[33];", "32 records"],
  ["consume(rows);", "direct indexed member access"],
])("retains a diagnostic for unsupported form %s", (body, reason) => {
  expect(run(source(body).replace("int main", "void consume(struct Row *p) {} int main")).error?.reason).toContain(reason);
});

it("bounds aggregate record storage before creating any records", () => {
  const result = run(`struct Large { char text[32769]; };
    int main(void) { struct Large entries[2]; return 0; }`);
  expect(result.error?.reason).toContain("65536 bytes");
  expect(result.trace.steps.at(-1)?.frames[0].variables?.entries).toBeUndefined();
});
