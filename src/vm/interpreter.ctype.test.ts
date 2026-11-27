import { describe, expect, it } from "vitest";
import { run } from "./interpreter";

const execute = (source: string, input = "") => {
  const result = run(source, 100000, 100, input);
  expect(result.status, result.error?.reason).toBe("ok");
  return result;
};

describe("C-locale character classes", () => {
  it("classifies literal and input characters, including whitespace and EOF", () => {
    const result = execute(`#include <ctype.h>
      int main(void) {
        int c;
        do {
          c = getchar();
          printf("%d%d%d\\n", !!isspace(c), !!isalnum(c), !!isdigit(c));
        } while (c != EOF);
        return 0;
      }`, "\t\v\n z7+");
    expect(result.trace.steps.at(-1)?.stdout).toBe("100\n100\n100\n100\n010\n011\n000\n000\n");
  });

  it("wraps direct unsigned-char operands without evaluating them twice", () => {
    const result = execute(`int main(void) {
      int c = 304;
      printf("%d ", isdigit((unsigned char)c++));
      printf("%d %d %d %d", c, isdigit((unsigned char)-208), isalnum(255), isspace((unsigned char)EOF));
      return 0;
    }`);
    expect(result.trace.steps.at(-1)?.stdout).toBe("1 305 1 0 0");
  });

  it.each([["isspace()", "expects 1 arguments"], ["isdigit(-2)", "EOF"], ["isalnum(256)", "EOF"],
    ["isdigit(1.5)", "integer character code"], ['isdigit("7")', "not a pointer"], ["isdigit(p)", "not a pointer"]
  ])("diagnoses invalid calls like %s", (expression, message) => {
    const result = run(`int main(void) { char *p = "7"; return ${expression}; }`);
    expect(result.status).toBe("error");
    expect(result.error?.reason).toContain(message);
  });

  it("does not replace a user-defined function with the same name", () => {
    const result = execute(`int isdigit(int a, int b) { return a + b; }
      int main(void) { printf("%d", isdigit(1, 3)); return 0; }`);
    expect(result.trace.steps.at(-1)?.stdout).toBe("4");
  });
});
