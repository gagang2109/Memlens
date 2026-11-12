import { describe, expect, it } from "vitest";
import { run } from "./interpreter";

function expectOutput(body: string, expected: string) {
  const result = run(`int main() { ${body} return 0; }`, 100);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
}

describe("C loop conditions", () => {
  it("does not execute an initially false while body", () => {
    expectOutput('int x = 0; while (0) { x++; } printf("%d", x);', "0");
  });
  it("executes a do-while body before its first condition", () => {
    expectOutput('int x = 0; do { x++; } while (0); printf("%d", x);', "1");
  });
  it("evaluates a while condition before each iteration, exactly once", () => {
    expectOutput('int checks = 0; int count = 0; while (++checks < 3) { count++; } printf("%d %d", checks, count);', "3 2");
  });
  it("rechecks a while condition after continue and skips it after break", () => {
    expectOutput('int checks = 0; int total = 0; while (++checks < 5) { if (checks == 1) continue; total += checks; if (checks == 3) break; } printf("%d %d", checks, total);', "3 5");
  });
  it("rechecks a do-while condition after continue and skips it after break", () => {
    expectOutput('int x = 0; int checks = 0; do { x++; if (x == 1) continue; break; } while (++checks < 3); printf("%d %d", x, checks);', "2 1");
  });
  it.each(["while (1) {}", "do {} while (1);"])("bounds an empty infinite loop: %s", loop => {
    const result = run(`int main() { ${loop} }`, 5);
    expect(result.status).toBe("error");
    expect(result.error?.reason).toBe("step limit reached");
  });
});

describe("C logical short-circuiting", () => {
  it.each([
    ["0 && ++x", "0 0"],
    ["1 || ++x", "0 1"],
    ["1 && ++x", "1 1"],
    ["0 || ++x", "1 1"],
    ["2 && 3", "0 1"],
    ["0 || 7", "0 1"],
  ])("evaluates %s with the correct side effects and boolean result", (expression, expected) => {
    expectOutput(`int x = 0; int answer = ${expression}; printf("%d %d", x, answer);`, expected);
  });
  it("evaluates the left operand only once", () => {
    expectOutput('int x = 0; int y = ++x && 1; int z = ++x || 0; printf("%d %d %d", x, y, z);', "2 1 1");
  });
  it("skips a null dereference guarded by &&", () => {
    expectOutput('int *p = NULL; if (p != NULL && *p == 1) { printf("bad"); } printf("ok");', "ok");
  });
  it("skips a null dereference guarded by ||", () => {
    expectOutput('int *p = NULL; if (p == NULL || *p == 1) { printf("ok"); }', "ok");
  });
  it("still reports an unguarded null dereference", () => {
    const result = run('int main() { int *p = NULL; int x = 1 && *p; }', 100);
    expect(result.status).toBe("error");
    expect(result.error?.reason).toBe("null pointer dereference");
  });
});
