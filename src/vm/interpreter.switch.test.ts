import { describe, expect, it } from "vitest";
import { run } from "./interpreter";

function output(source: string) {
  const result = run(source);
  expect(result.status, result.error?.reason).toBe("ok");
  return result.trace.steps.at(-1)?.stdout;
}

describe("switch dispatch in data-structure menus", () => {
  it("selects a matching stack operation before considering default", () => {
    expect(output(`int main() {
      int stack[3]; int top = -1; int choice = 1;
      switch (choice) {
        default: printf("invalid"); break;
        case 1: stack[++top] = 42; break;
        case 2: printf("empty"); break;
      }
      printf("%d %d", top, stack[top]);
    }`)).toBe("0 42");
  });
  it("starts at default only when no case matches, preserving fallthrough", () => {
    expect(output(`int main() {
      switch (9) {
        case 1: printf("one"); break;
        default: printf("fallback ");
        case 2: printf("two"); break;
      }
    }`)).toBe("fallback two");
  });
  it("falls through default after entering an earlier matching case", () => {
    expect(output(`int main() { switch (1) {
      case 1: printf("one "); default: printf("default "); case 2: printf("two");
    } }`)).toBe("one default two");
  });
  it("skips unmatched switches without default and evaluates selector once", () => {
    expect(output(`int main() { int choice = 0; switch (++choice) {
      case 2: printf("bad"); break;
    } printf("%d", choice); }`)).toBe("1");
  });
  it("keeps nested break local and propagates continue to the enclosing loop", () => {
    expect(output(`int main() { int i = 0; while (++i < 4) {
      switch (i) {
        default: continue;
        case 2: switch (2) { case 2: printf("two "); break; } break;
      }
      printf("done");
    } }`)).toBe("two done");
  });
});
