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
