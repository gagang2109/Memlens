import { describe, expect, it } from "vitest";
import { run } from "./interpreter";

describe("calloc argument evaluation", () => {
  it("evaluates a dynamic queue capacity expression only once", () => {
    const result = run(`int main() {
      int capacity = 2;
      int *queue = calloc(capacity++, sizeof(int));
      printf("%d %d %d", capacity, queue[0], queue[1]);
      free(queue);
    }`);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("3 0 0");
    expect(result.leaks).toHaveLength(0);
  });
  it("evaluates an element size expression only once", () => {
    const result = run(`int main() {
      int size = 4;
      int *stack = calloc(2, size++);
      printf("%d %d %d", size, stack[0], stack[1]);
      free(stack);
    }`);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("5 0 0");
  });
  it("calls allocation-size helper once rather than once per zeroed byte", () => {
    const result = run(`int capacity() { printf("capacity "); return 2; }
      int main() { int *queue = calloc(capacity(), sizeof(int));
        printf("%d %d", queue[0], queue[1]); free(queue); }`);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("capacity 0 0");
    expect(result.trace.steps.filter(step => step.event === "call" && step.frames.some(frame => frame.name === "capacity"))).toHaveLength(1);
  });

});
