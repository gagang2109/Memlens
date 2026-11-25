import { expect, it } from "vitest";
import { run } from "./interpreter";

it.each([
  '"A"',
  '2.0',
  '-2.0',
  'd',
  'p',
  'n',
  'D',
  'floating()',
  '(1 ? 2 : 2.0)',
])("does not use noninteger operand %s for %%=", rhs => {
  const result = run(`#define D 2.0
double floating(void) { return 2; }
int main(void) {
  double d=2; int x=7; int *p=&x; int n[2]={2,3};
  x %=${rhs}; printf("%d",x);
}`);
  expect(result.status).toBe("error");
  expect(result.error?.reason).toContain("integer operand");
  expect(result.error?.line).toBe(5);
  expect(result.trace.steps.at(-1)?.frames[0]?.variables?.x?.value).toBe("7");
});

it("promotes a character literal, not a string", () => {
  const result = run("int main(void) { int x=67; x %= 'A'; printf(\"%d\",x); }");
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("2");
});

it("binds a compound RHS conditional at assignment precedence", () => {
  const result = run('int main(void) { int x=7; x *= 0 ? 2 : 3; printf("%d",x); }');
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("21");
});

it("does not allow compound writes to const objects", () => {
  const result = run('int main(void){ const int n=5; n*=2; printf("%d", n); }');
  expect(result.error?.reason).toContain("cannot modify a const target");
});
it.each(["*p", "p[0]"])("does not treat pointer-to-pointer target %s as an int", name => {
  const result = run(`int main(void){ int x=2; int *q=&x; int **p=&q; ${name}*=2; }`);
  expect(result.error?.reason).toContain("supported integer target");
});
it.each([
  ["2147483647", "*=", "2"],
  ["-2147483648", "/=", "-1"],
  ["-2147483648", "%=", "-1"],
])("does not store an undefined signed-int result from %s %s %s", (value, operator, rhs) => {
  const result = run(`int main(void){ int n=${value}; n ${operator} ${rhs}; }`);
  expect(result.error?.reason).toContain("overflows signed int");
  expect(result.trace.steps.at(-1)?.frames[0]?.variables?.n?.value).toBe(value);
});
it("supports negative arithmetic, integer macros, character arithmetic and nested array lvalues", () => {
  const result = run(`#define FACTOR 3
int f(int x) { return x + 1; }
int main(void) {
  int a[2][2]={{1,-7},{3,4}}; int i=0; int j=1;
  a[i++][j++]/=f(FACTOR)-2;
  printf("%d %d %d %d",a[0][1],a[1][0],i,j);
}`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("-3 3 1 2");
});
