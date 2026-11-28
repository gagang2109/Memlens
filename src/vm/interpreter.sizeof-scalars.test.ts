import { expect, it } from "vitest";
import { run } from "./interpreter";

it("uses declared int and char sizes instead of reading values or treating names like structs", () => {
  const result = run(`#include <stdio.h>
int global=123;
int size(char param) {
  const int n=7; char c;
  printf("%zu %zu %zu %zu %zu %zu", sizeof(int), sizeof n, sizeof(n), sizeof c, sizeof(param), sizeof(global));
  return 0;
}
int main(void) { return size('x'); }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("4 4 4 1 1 4");
});

it("sizes ordinary C literals by their type, not by their value", () => {
  const result = run(String.raw`#include <stdio.h>
int main(void) {
  printf("%zu %zu %zu %zu %zu %zu %zu %zu\n",
    sizeof(99), sizeof 0, sizeof('X'), sizeof(""), sizeof("A\0B"),
    sizeof(2.5f), sizeof(2.5), sizeof(-0177));
  return 0;
}`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("4 4 4 1 4 4 8 4\n");
});

it.each([
  ['"é"', "non-ASCII"],
  ["2147483648", "supported int range"],
])("reports an unsupported literal ABI for %s rather than guessing", (operand, reason) => {
  const result = run(`int main(void) {
    printf("%zu", sizeof(${operand}));
  }`);
  expect(result.status).toBe("error");
  expect(result.error).toMatchObject({ line: 2, diagnosticKind: "unsupported-c" });
  expect(result.error?.reason).toContain(reason);
});
