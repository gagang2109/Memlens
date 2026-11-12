import { describe, expect, it } from "vitest";
import { run } from "../../src/vm/interpreter";

describe("ordinary lab language forms", () => {
  it("accepts multiple declarators, comma loop expressions, and main variants", () => {
    const result = run(`int main(int argc, char *argv[]) { int n, i; int a = 1, b = 2; for (i = 0, n = 3; i < n; i++, n--) a += b; printf("%d", a); }`);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("5");
  });

  it("accepts qualifiers, floating values, width and precision formats, getchar and exit", () => {
    const result = run(`int main(void) { const static unsigned short n = 3; long long big = 4; float f = 1.25; double d = 2.5; printf("%5d %.2f %lf", n + big, f, d); getchar(); exit(0); }`, 100000, 100, "x");
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("    7 1.25 2.500000");
  });

  it("accepts anonymous typedef structs, struct values, and two-dimensional arrays", () => {
    const result = run(`typedef struct { int data; } Item; int add(Item *p) { return p->data; } int main() { Item item, items[2]; int matrix[2][2] = {{1, 2}, {3, 4}}; item.data = matrix[0][1] + matrix[1][0]; items[0].data = 9; printf("%d", add(&item) + items[0].data); }`);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("14");
  });
});
