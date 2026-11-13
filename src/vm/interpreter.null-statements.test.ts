import { describe, expect, it } from "vitest";
import { run } from "./interpreter";

describe("C null statements", () => {
  const check = (body: string, output: string) => {
    const result = run(`int main() { ${body} return 0; }`);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe(output);
  };
  it("searches an array with an empty for body", () => {
    check(`int a[4] = {3, 7, 9, 12}; int i;
      for (i = 0; i < 4 && a[i] != 9; i++);
      printf("%d", i);`, "2");
  });
  it("completes an unsuccessful empty-body search without indexing past the array", () => {
    check(`int a[4] = {3, 7, 9, 12}; int i;
      for (i = 0; i < 4 && a[i] != 11; i++);
      printf("%d", i);`, "4");
  });
  it("supports a while loop whose condition advances the cursor", () => {
    check(`int a[4] = {3, 7, 9, 12}; int i = 0;
      while (a[i++] != 9);
      printf("%d", i);`, "3");
  });
  it("supports an empty do-while body", () => {
    check(`int i = 0; do; while (++i < 3); printf("%d", i);`, "3");
  });
  it("retains the dangling else relationship with an empty if branch", () => {
    check(`int x = 0; if (1) if (0); else x = 7; printf("%d", x);`, "7");
  });
  it("ignores repeated standalone semicolons without skipping the next statement", () => {
    check(`;;; int x = 1; ;;; x++; ; printf("%d", x);`, "2");
  });
  it("does not create execution steps for standalone semicolons", () => {
    const plain = run("int main() { int x = 1; x++; return 0; }");
    const padded = run("int main() { ;;; int x = 1; ; x++; ;; return 0; }");
    expect(padded.status).toBe("ok");
    expect(padded.trace.steps).toHaveLength(plain.trace.steps.length);
  });
  it.each(["for (;;);", "while (1);", "do; while (1);"])("bounds the empty infinite loop %s", body => {
    const result = run(`int main() { ${body} }`, 10);
    expect(result.status).toBe("error");
    expect(result.error?.reason).toBe("step limit reached");
  });
});
