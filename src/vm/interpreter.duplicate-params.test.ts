import { expect, it } from "vitest";
import { run } from "./interpreter";
import { practiceSource } from "../ui/practiceHarness";

it.each([";", "{ return n; }"])("rejects repeated parameter names in %s at the second identifier", ending => {
  const result = run(`int sum(int n,
/* second parameter */ int *n)${ending}
int main(void) { return 0; }`);
  expect(result.status).toBe("error");
  expect(result.error?.reason).toContain("duplicate parameter 'n' in function 'sum'");
  expect(result.error?.line).toBe(2);
  expect(result.trace.steps.at(-1)?.stdout).toBe("");
});

it("maps the duplicate array parameter to its test setup line", () => {
  const prepared = practiceSource("int id(int a) { return a; }", "int helper(int *a,\nint a[]) { return 0; }\nprintf(\"%d\", id(4));");
  const result = run(prepared.source);
  expect(result.error?.reason).toContain("duplicate parameter 'a' in function 'helper'");
  expect(prepared.location(result.error!.line)).toBe("test setup line 2");
});

it("allows repeated declarations and names reused by different functions", () => {
  const result = run('int f(int arg0, int); int f(int, int arg0); int g(int arg0){ return arg0; } int f(int arg0, int x){ return g(arg0)+x; } int main(void){ printf("%d",f(3,4)); }');
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("7");
});

it("keeps unnamed definition parameters unbound without dropping argument side effects", () => {
  const result = run('int f(int arg1, int){ return arg1; } int main(void){ int i=7; int v=f(3,i++); printf("%d %d",v,i); }');
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("3 8");
});
