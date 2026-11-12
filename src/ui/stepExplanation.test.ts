import { expect, it } from "vitest";
import { explainStep } from "./stepExplanation";
it("guides a new user without claiming execution has occurred", () => {
  expect(explainStep()).toContain("click Run");
});
it("explains recorded events without inventing a variable change", () => {
  expect(explainStep({ line: 7 })).toBe("Line 7: Inspect the variables and memory recorded at this point.");
  expect(explainStep({ line: 4, event: "free" })).toContain("does not automatically clear pointers");
  expect(explainStep({ line: 2, event: "alloc" })).toContain("simulated heap memory");
});
it("preserves the recorded error detail", () => {
  expect(explainStep({ line: 9, event: "error", message: "use after free" })).toContain("use after free");
});
