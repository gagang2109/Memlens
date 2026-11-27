import { expect, it } from "vitest";
import { run } from "./interpreter";

it("matches the C pointer-depth equivalences without reading a null operand", () => {
  const result = run(`int main(void) {
    int **rows=0;
    printf("%d %d", sizeof(int *) == sizeof *rows, sizeof(int) == sizeof **rows);
  }`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("1 1");
});

it("uses the teaching pointer slot size for qualified and aliased types", () => {
  const result = run(`typedef struct Tag { int datum; } Row;
  int main(void) { printf("%zu %zu %zu %zu",sizeof(char *),sizeof(const int * const *),sizeof(Row *),sizeof(struct Tag *)); }`);
  expect(result.status,result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("4 4 4 4");
});

it("sizes typed indexes without evaluating them or touching heap storage", () => {
  const r = run(`struct R { char text[3]; int mark; };
  int main(void) { char **p=0; struct R **r=0; int i=0;
    printf("%zu %zu %zu %zu %zu %d", sizeof p, sizeof p[i++], sizeof p[i++][9], sizeof **r, sizeof *r, i);
  }`);
  expect(r.status,r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("4 4 1 8 4 0");
  expect(r.trace.steps.at(-1)?.memory.allocations).toEqual([]);
});

it.each([
  ["int **p=0; printf(\"%zu\", sizeof ***p);", "too many subscripts"],
  ["int **p=0; printf(\"%zu\", sizeof p[1.5]);", "requires a supported integer"],
  ["void *p=0; printf(\"%zu\", sizeof *p);", "void pointee"],
])("rejects invalid pointer operands: %s", (code, error) => {
  const result = run(`int main(void){ ${code} }`);
  expect(result.status).toBe("error");
  expect(result.error?.reason).toContain(error);
});
