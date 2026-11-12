import { describe, expect, it } from "vitest";
import { run } from "./interpreter";

function output(body: string) {
  const result = run(`int main() { int a[2][2] = {1,2,3,4}; ${body} }`);
  expect(result.status, result.error?.reason).toBe("ok");
  return result.trace.steps.at(-1)?.stdout;
}

describe("matrix index evaluation", () => {
  it("evaluates a row index exactly once on reads", () => {
    expect(output('int i=0; int x=a[i++][1]; printf("%d %d",x,i);')).toBe("2 1");
  });
  it("evaluates independent row and column side effects once on writes", () => {
    expect(output('int i=0; int j=0; a[i++][j++]=9; printf("%d %d %d",a[0][0],i,j);')).toBe("9 1 1");
  });
  it("evaluates a row index exactly once on compound assignment", () => {
    expect(output('int i=0; a[i++][1]+=5; printf("%d %d",a[0][1],i);')).toBe("7 1");
  });
  it("evaluates a row index exactly once on postfix update", () => {
    expect(output('int i=0; int x=a[i++][1]++; printf("%d %d %d",x,a[0][1],i);')).toBe("2 3 1");
  });
  it("evaluates a row index exactly once for address-of", () => {
    expect(output('int i=0; int *p=&a[i++][1]; printf("%d %d",p==&a[0][1],i);')).toBe("1 1");
  });
  it("evaluates function calls in a row index once", () => {
    const result = run('int next(int *i) { int old=*i; *i+=1; return old; } int main(){ int a[2][2]={1,2,3,4}; int i=0; int x=a[next(&i)][1]; printf("%d %d",x,i); }');
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("2 1");
  });
  it.each(["a[-1][1]", "a[2][0]"])("preserves out-of-bounds diagnostics in %s", expression => {
    const result = run(`int main(){ int a[2][2]={1,2,3,4}; printf("%d",${expression}); }`);
    expect(result.status).toBe("error");
    expect(result.error?.reason).toContain("array index out of bounds");
  });
  it("preserves a one-past-row address that points to the next row", () => {
    expect(output('int i=0; int *p=&a[i++][2]; printf("%d %d",p==&a[1][0],i);')).toBe("1 1");
  });
  it("preserves ordinary one-dimensional index evaluation", () => {
    const result=run('int main(){ int a[2]={5,6}; int i=0; int x=a[i++]; printf("%d %d",x,i); }');
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("5 1");
  });
});
