import { describe, expect, it } from "vitest";
import { run } from "./interpreter";

describe("strcmp C ordering", () => {
  it("compares ASCII byte values rather than locale collation", () => {
    const result = run(`int main() {
      printf("%d %d %d %d %d", strcmp("Z", "a") < 0,
        strcmp("a", "Z") > 0, strcmp("same", "same") == 0,
        strcmp("cat", "catalog") < 0, strcmp("b", "aa") > 0);
    }`);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("1 1 1 1 1");
  });
  it("uses unsigned UTF-8 bytes and evaluates each argument once", () => {
    const result = run(`char *left() { printf("L"); return "é"; }
      char *right() { printf("R"); return "z"; }
      int main() { printf("%d", strcmp(left(), right()) > 0); }`);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("LR1");
  });
  it("handles empty strings and first differing characters", () => {
    const result = run(`int main() { printf("%d %d %d", strcmp("", "") == 0,
      strcmp("", "a") < 0, strcmp("abz", "aca") < 0); }`);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("1 1 1");
  });
  it("stops comparison at the first embedded NUL", () => {
    const result = run(String.raw`int main() {
      printf("%d %d", strcmp("a\0z", "a\0b") == 0,
        strcmp("\0z", "") == 0);
    }`);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("1 1");
  });
});
