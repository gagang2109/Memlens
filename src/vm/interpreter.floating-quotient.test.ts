import { describe, expect, it } from "vitest";
import { run } from "./interpreter";

describe("floating-point quotients in C labs", () => {
  it("keeps fractions for floating operands but truncates integer-only quotients", () => {
    const result = run(`#include <stdio.h>
#define DIVISOR 3e0F
double whole(void) { return 241; }
int main(void) {
    float sum = 0;
    sum += 70;
    sum += 80;
    sum += 91;
    printf("%.2f %.2f %.2f %.2f\\n", sum / 3.0f, sum / 3, 241 / 3.0, 241 / DIVISOR);
    printf("%.2f %.2f %.2f %.2f\\n", -whole() / 3, (double)241 / 3, (240 + 1.0F) / 3, (1 ? 241 : .5) / 3);
    int divisor = 3, number = 0;
    printf("%d %d %d %d %d\\n", 241 / divisor, -241 / 3, 241 / (1.0 > .5 ? 3 : 2), 241 / (number++, 3), 241 / (int)3.0F);
    printf("%.2f\\n", (number++, sum) / 3);
    printf("%d\\n", number);
    return 0;
}`);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe(
      "80.33 80.33 80.33 80.33\n-80.33 80.33 80.33 80.33\n80 -80 80 80 80\n80.33\n2\n"
    );
  });

  it("classifies floating literals as invalid fixed struct-array bounds", () => {
    const result = run("struct Word { int data[3e0F]; }; int main(void) { return 0; }");
    expect(result.status).not.toBe("ok");
    expect(result.error?.reason).toContain("positive integer");
  });

  it("keeps the zero-divisor diagnostic for floating operands", () => {
    const result = run('int main(void) { float sum = 241; printf("%f", sum / 0.0F); return 0; }');
    expect(result.status).not.toBe("ok");
    expect(result.error?.reason).toContain("division by zero");
  });
});
