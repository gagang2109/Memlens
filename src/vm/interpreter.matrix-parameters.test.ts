import { expect, it } from "vitest";
import { run } from "./interpreter";

it("writes the caller's matrix through a chain of helpers and resolves each subscript once", () => {
  const result = run(`#define COLS 3
void bump(int a[][COLS]) {
  int row=1, col=0; a[row++][++col] *= 2;
  printf("%d %d ", row, col);
}
void relay(int a[2][COLS]) { bump(a); }
int main(void) {
  int a[2][COLS] = {{1,2,3},{4,5,6}};
  relay(a);
  printf("%d %d",a[1][1],a[1][2]);
}`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("2 1 10 6");
});

it.each([["2", "0"], ["-1", "0"], ["0", "3"], ["1", "-1"]])(
  "checks row and column boundaries separately in a matrix parameter: %s %s", (row, col) => {
    const result = run(`void read(int a[][3]) { printf("%d",a[${row}][${col}]); }
      int main(void) { int a[2][3]; read(a); }`);
    expect(result.error?.reason).toContain("array index out of bounds");
  }
);

it.each(["int a[3][2];", "int a[6];", "char a[2][3];", "int *a=NULL;"])(
  "rejects an incompatible argument to a matrix parameter: %s", declaration => {
    const result=run(`void read(int a[][3]) { printf("%d",a[0][0]); }
      int main(void) { ${declaration} read(a); }`);
    expect(result.error?.reason).toContain("matching columns and element type");
  }
);

it("does not substitute an incorrect row size for a dynamic column expression", () => {
  const result=run(`void read(int n,int a[][n]) { printf("%d",a[0][0]); }
    int main(void) { int a[2][3]; read(3,a); }`);
  expect(result.error?.reason).toContain("fixed column count");
});
