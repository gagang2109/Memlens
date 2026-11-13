import { describe, expect, it } from "vitest";
import { run } from "./interpreter";
import { parse } from "../lang/parser";

describe("postfix updates through dereferenced scalar pointers", () => {
  const check = (source: string, expected: string) => {
    const result = run(source);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
  };
  it("increments a DS counter through a function parameter", () => {
    check(`void increment(int *count) { (*count)++; }
      int main() { int count = 2; increment(&count); printf("%d", count); return 0; }`, "3");
  });
  it("returns the old scalar value for both postfix operators", () => {
    check(`int main() { int count = 4; int *p = &count;
      int beforeIncrement = (*p)++; int beforeDecrement = (*p)--;
      printf("%d %d %d", beforeIncrement, beforeDecrement, count); return 0; }`, "4 5 4");
  });
  it("increments a heap counter without changing its pointer", () => {
    check(`int main() { int *p = malloc(sizeof(int)); *p = 7;
      int before = (*p)++; printf("%d %d", before, *p); free(p); return 0; }`, "7 8");
  });
  it("evaluates a dereferenced call exactly once", () => {
    check(`int calls = 0; int value = 8;
      int *counter() { calls++; return &value; }
      int main() { int before = (*counter())++; printf("%d %d %d", calls, before, value); return 0; }`, "1 8 9");
  });
  it("does not change prefix increment semantics", () => {
    check(`int main() { int x = 4; int *p = &x; int after = ++(*p); printf("%d %d", after, x); return 0; }`, "5 5");
  });
  it.each(["*p++++", "*p++--", "*p--++", "*p----"])("rejects an unparenthesized postfix chain %s", expression => {
    const result = run(`int main() { int x = 3; int *p = &x; ${expression}; return 0; }`);
    expect(result.status).toBe("error");
    expect(result.error?.reason).toContain("parse error");
  });
  it("still rejects postfix updates to a non-lvalue unary expression", () => {
    const result = run("int main() { int x = 4; (-x)++; return 0; }");
    expect(result.status).toBe("error");
  });
  it("retains use-after-free diagnostics for a heap scalar", () => {
    const result = run("int main() { int *p = malloc(sizeof(int)); *p = 1; free(p); (*p)++; return 0; }");
    expect(result.status).toBe("error");
    expect(result.error?.reason).toBe("use-after-free");
  });
  it("retains null pointer diagnostics", () => {
    const result = run("int main() { int *p = NULL; (*p)++; return 0; }");
    expect(result.status).toBe("error");
    expect(result.error?.reason).toBe("null pointer dereference");
  });
});


describe("dereference/postfix precedence", () => {
  it.each([
    ["(*p)++", { op: "++", postfix: true, expr: { op: "*", expr: { name: "p" } } }],
    ["*p++", { op: "*", expr: { op: "++", postfix: true, expr: { name: "p" } } }],
    ["++*p", { op: "++", expr: { op: "*", expr: { name: "p" } } }],
  ])("preserves the AST for %s", (expression, expected) => {
    const program = parse(`int main() { ${expression}; }`);
    const body = program.functions.get("main")!.body;
    expect(body.kind).toBe("block");
    if (body.kind !== "block") throw new Error("expected block");
    expect(body.body[0]).toMatchObject({ kind: "expr", expr: expected });
  });
});
