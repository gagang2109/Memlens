import { describe, expect, it } from "vitest";
import { run } from "./interpreter";

describe("heap array read diagnostics", () => {
  it("reports reading a freed dynamic stack element", () => {
    const result = run(`int main() {
      int *stack = malloc(3 * sizeof(int));
      stack[0] = 42;
      free(stack);
      printf("%d", stack[0]);
    }`);
    expect(result.status).toBe("error");
    expect(result.error?.reason).toBe("use-after-free");
    expect(result.error?.line).toBe(5);
    expect(result.error?.allocation?.line).toBe(2);
  });
  it("reports reading an uninitialized dynamic queue slot", () => {
    const result = run(`int main() {
      int *queue = malloc(3 * sizeof(int));
      queue[0] = 7;
      printf("%d", queue[1]);
    }`);
    expect(result.status).toBe("error");
    expect(result.error?.reason).toBe("uninitialized read");
    expect(result.error?.line).toBe(4);
  });
  it("preserves initialized full-width values rather than truncating to a byte", () => {
    const result = run(`int main() {
      int *stack = malloc(2 * sizeof(int));
      stack[0] = 1000; stack[1] = -10;
      printf("%d %d", stack[0], stack[1]);
      free(stack);
    }`);
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("1000 -10");
    expect(result.leaks).toHaveLength(0);
  });
  it("allows zero-initialized calloc array elements", () => {
    const result = run(`int main() { int *queue = calloc(2, sizeof(int));
      printf("%d %d", queue[0], queue[1]); free(queue); }`);
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("0 0");
  });
  it("preserves heap cells copied by realloc and strcpy", () => {
    const result = run(`int main() {
      int *stack = malloc(2 * sizeof(int)); stack[0] = 1000;
      stack = realloc(stack, 4 * sizeof(int));
      char *label = malloc(8); strcpy(label, "queue");
      printf("%d %c", stack[0], label[0]); free(stack); free(label);
    }`);
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("1000 q");
  });
  it("keeps local arrays and pointers into local arrays working", () => {
    const result = run(`int main() { int values[2] = {3, 4}; int *p = values;
      printf("%d %d", values[0], p[1]); }`);
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("3 4");
  });

  it("takes an uninitialized slot address without reading it, then scanf initializes it", () => {
    const result = run(`int main() { int *queue = malloc(2 * sizeof(int));
      scanf("%d", &queue[1]); printf("%d", queue[1]); free(queue); }`, 100000, 100, "37");
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("37");
  });
  it("still checks the old value for read-modify-write operations", () => {
    for (const operation of ["queue[0] += 1", "queue[0]++"]) {
      const result = run(`int main() { int *queue = malloc(sizeof(int)); ${operation}; }`);
      expect(result.status).toBe("error");
      expect(result.error?.reason).toBe("uninitialized read");
    }
  });

  it("shares initialized values through a legitimate pointer alias", () => {
    const result = run(`int main() { int *queue = malloc(2 * sizeof(int));
      int *alias = queue; queue[1] = 900; printf("%d", alias[1]); free(queue); }`);
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("900");
  });
  it("preserves out-of-bounds and freed-write diagnostics", () => {
    const bounds = run(`int main() { int *p = malloc(sizeof(int)); printf("%d", p[1]); }`);
    expect(bounds.error?.reason).toBe("pointer index out of bounds (1)");
    const freedWrite = run(`int main() { int *p = malloc(sizeof(int)); free(p); p[0] = 7; }`);
    expect(freedWrite.error?.reason).toBe("use-after-free");
  });

  it.each([
    ['strcpy(label, "queue")', 5],
    ['strcpy(label, "")', 0],
    ['strcpy(label, "que"); strcat(label, "ue")', 5],
  ])("reads the terminating NUL after %s", (operation, index) => {
    const result = run(`int main() { char *label = malloc(8); ${operation};
      printf("%d", label[${index}]); free(label); }`);
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("0");
  });
  it("takes the address of an uninitialized slot for subsequent pointer assignment", () => {
    const result = run(`int main() { int *queue = malloc(2 * sizeof(int));
      int *slot = &queue[1]; *slot = 37; printf("%d", queue[1]); free(queue); }`);
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("37");
  });

});
