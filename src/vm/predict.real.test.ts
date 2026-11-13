import { expect, it } from "vitest";
import { run } from "./interpreter";
import { nextPointerPrediction, checkPrediction } from "./predict";
it("accepts NULL for numeric zero pointer assignment", () => {
 const result = run(`int main() { int *p = malloc(4); p = 0; }`);
 expect(result.status).toBe("ok");
 const steps = result.trace.steps;
 const index = steps.findIndex(s => s.pointers?.some(p => p.from === "main.p" && p.to === 0));
 expect(index).toBeGreaterThan(0);
 const question = nextPointerPrediction(steps[index-1], steps[index]);
 expect(question).toEqual({label:"main.p",expected:null});
 expect(checkPrediction(null, question!.expected)).toBe(true);
});
it("does not teach that a returned function's local pointer becomes NULL", () => {
 const result = run(`void visit(int *p) { printf("%d", *p); } int main() { int *head = malloc(4); *head = 7; visit(head); }`);
 expect(result.status).toBe("ok");
 const steps = result.trace.steps;
 const index = steps.findIndex((s,i) => i>0 && s.event === "return" && steps[i-1].pointers?.some(p => p.from === "visit.p"));
 expect(index).toBeGreaterThan(0);
 expect(nextPointerPrediction(steps[index-1],steps[index])).toBeUndefined();
});
it("offers NULL for an explicit NULL assignment", () => {
 const result = run(`int main() { int *p = malloc(4); p = NULL; }`);
 const steps = result.trace.steps;
 const index = steps.findIndex((s,i) => i>0 && s.frames.some(f => f.variables?.p?.value === "null") && steps[i-1].pointers?.some(p => p.from === "main.p"));
 expect(index).toBeGreaterThan(0);
 expect(nextPointerPrediction(steps[index-1],steps[index])).toEqual({label:"main.p",expected:null});
});
it("does not mistake integer zero or a string pointer for a NULL pointer change", () => {
 const result = run(`int main() { int n = 0; char *p = malloc(4); p = "hello"; }`);
 const steps = result.trace.steps;
 const index = steps.findIndex(s => s.frames.some(f => f.variables?.p?.stringPointer));
 expect(index).toBeGreaterThan(0);
 expect(nextPointerPrediction(steps[index-1],steps[index])).toBeUndefined();
 expect(nextPointerPrediction(steps[0],steps[1])).toBeUndefined();
});
it("does not ask about unchanged NULL written as zero", () => {
 const result = run(`int main() { int *p = NULL; p = 0; }`);
 const steps = result.trace.steps;
 const index = steps.findIndex(s => s.pointers?.some(p => p.from === "main.p" && p.to === 0));
 expect(index).toBeGreaterThan(0);
 expect(nextPointerPrediction(steps[index-1],steps[index])).toBeUndefined();
});
it("skips ambiguous recursive locals rather than treating an outer NULL as an inner pointer", () => {
 const result = run(`void visit(int n) { int *p = NULL; if (n > 0) visit(n - 1); else p = malloc(4); } int main() { visit(1); }`);
 expect(result.status).toBe("ok");
 const steps = result.trace.steps;
 let compared = 0;
 for (let i = 1; i < steps.length; i++) {
   const before = steps[i-1], after = steps[i];
   if ([before,after].some(step => step.frames.filter(f => f.name === "visit").length > 1)) {
     compared++;
     expect(nextPointerPrediction(before,after)).toBeUndefined();
   }
 }
 expect(compared).toBeGreaterThan(2);
 expect(steps.some(s => s.pointers?.some(p => p.from === "visit.p" && p.to > 0))).toBe(true);
});
