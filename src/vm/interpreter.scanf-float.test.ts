import { expect, it } from "vitest";
import { run } from "./interpreter";

it("reads fractional records through a helper, preserving the winning mark and rewind", () => {
  const r = run(`struct Pupil { char name[4]; float marks; };
  void input(struct Pupil rows[]) {
    for (int i=0; i<2; ++i) scanf("%3s %f", rows[i].name, &rows[i].marks);
  }
  int main(void) {
    struct Pupil rows[2];
    input(rows);
    int best = rows[1].marks > rows[0].marks ? 1 : 0;
    printf("%s %.3f", rows[best].name, rows[best].marks);
    return 0;
  }`, 100000, 100, "Ari 88.125 Bo 88.875");
  expect(r.status, r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("Bo 88.875");
  const early = r.trace.steps.find(s => s.frames[0]?.variables?.["rows[0].marks"]?.value === "88.125"
    && s.frames[0].variables?.["rows[1].marks"]?.value === "uninitialized")!;
  expect(r.trace.goto(early.index)?.frames[0].variables?.["rows[1].marks"].value).toBe("uninitialized");
});

it("supports signs, exponent, field widths and ignored assignments", () => {
  const r = run(`int main(void) {
    float a,b,c; int n=scanf("%*f %2f%f %f", &a, &b, &c);
    printf("%d %.3f %.3f %.3f", n,a,b,c); return 0;
  }`, 100000, 100, " 42 12.5 -1.25e+1");
  expect(r.status, r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("3 12.000 0.500 -12.500");
});

it("waits on an open exponent and does not write an incomplete closed input", () => {
  const code = `int main(void) { float value=41; int n=scanf("%f",&value); printf("%d %.2f",n,value); return 0; }`;
  const waiting = run(code, 100000, 100, "2e+", true);
  expect(waiting.status).toBe("waiting");
  expect(waiting.trace.steps.at(-1)?.frames[0].variables?.value.value).toBe("41");
  expect(run(code, 100000, 100, "2e+").trace.steps.at(-1)?.stdout).toBe("0 41.00");
  expect(run(code, 100000, 100, "2e+1\n", true).trace.steps.at(-1)?.stdout).toBe("1 20.00");
});

it.each([
  ["int x=4; scanf(\"%f\",&x);", "8", "address of a writable float"],
  ["double x=4; scanf(\"%f\",&x);", "8", "address of a writable float"],
  ["float x=4; scanf(\"%f\",&x);", "1e99", "finite float range"],
  ["float x=4; scanf(\"%f\",&x);", "0x1p2", "finite decimal input"],
  ["float x=4; scanf(\"%f\",&x);", "nan", "finite decimal input"],
])("rejects non-modeled input or destinations: %s / %s", (body, input, diagnostic) => {
  const r = run(`int main(void){ ${body} return 0; }`, 100000, 100, input);
  expect(r.error?.reason).toContain(diagnostic);
  expect(r.trace.steps.at(-1)?.frames[0].variables?.x.value).toBe("4");
});

it("checks the lifetime when a pointer to a prior float local is returned", () => {
  const r = run(`float *expired(void) { float x=4; return &x; }
    int main(void) { scanf("%f", expired()); return 0; }`, 100000, 100, "2");
  expect(r.error?.reason).toContain("outside its lifetime");
});
