import { describe, expect, it } from "vitest";
import { run } from "./interpreter";
import { samples } from "../samples";
import { renderModel } from "../viz/model";

describe("Phase 1 samples", () => {
  it("runs the BST sample and prints inorder traversal", () => {
    const result = run(samples.tree.code);
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("1 2 3 4 6 ");
    expect(renderModel(result.trace.steps.at(-1)!).shape).toBe("tree");
  });
  it("runs the stack, queue, and recursion samples", () => {
    expect(run(samples.stack.code).trace.steps.at(-1)?.stdout).toBe("20 10 ");
    expect(run(samples.queue.code).trace.steps.at(-1)?.stdout).toBe("10 20 30 ");
    const factorial = run(samples.factorial.code);
    expect(factorial.trace.steps.at(-1)?.stdout).toBe("120");
    expect(Math.max(...factorial.trace.steps.map(step => step.frames.length))).toBeGreaterThan(2);
  });
  it("stops use-after-free at the access line and reports all leaked blocks", () => {
    const result = run(samples["use-after-free"].code);
    expect(result.status).toBe("error"); expect(result.error?.reason).toBe("use-after-free");
    expect(result.error?.allocation?.line).toBe(4); expect(result.error?.line).toBe(10);
    expect(result.leaks).toHaveLength(3);
    expect(result.orphanedAtExit).toHaveLength(2);
  });
  it("executes loops, user functions, recursion, and rewiring", () => {
    const result = run(`int fact(int n) {
      if (n <= 1) return 1;
      return n * fact(n - 1);
    }
    int main() {
      int answer = fact(4);
      printf("%d", answer);
    }`);
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("24");
    expect(result.trace.steps.some(step => step.event === "call")).toBe(true);
  });
  it("executes the requested push/reverse program and reports its freed access", () => {
    const result = run(samples.requested.code);
    expect(result.status).toBe("error");
    expect(result.error?.reason).toBe("use-after-free");
    expect(result.error?.line).toBe(35);
    expect(result.trace.steps.some(step => step.pointers?.some(pointer => pointer.label === "next"))).toBe(true);
  });
  it("preserves every machine state when visiting steps forward and backward", () => {
    const result = run(samples.requested.code);
    const trace = result.trace;
    const states = trace.steps.map(step => JSON.stringify(step));
    for (let index = 0; index < trace.steps.length; index++) {
      trace.goto(index);
      trace.goto(0);
      trace.goto(index);
      expect(JSON.stringify(trace.view)).toBe(states[index]);
    }
  });
  it("has exactly two orphaned blocks immediately after free(dead)", () => {
    const result = run(samples.requested.code);
    const freeStep = result.trace.steps.find(step => step.event === "free");
    expect(freeStep).toBeDefined();
    expect(renderModel(freeStep!).nodes.filter(node => node.orphaned)).toHaveLength(2);
  });
});
