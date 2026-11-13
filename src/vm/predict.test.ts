import { describe, expect, it } from "vitest";
import { checkPrediction, nextPointerPrediction } from "./predict";

describe("pointer prediction", () => {
  it("detects the next pointer assignment and accepts node or NULL answers", () => {
    const before = { index: 0, line: 1, stdout: "", memory: { bytes: [], shadows: [], allocations: [] }, frames: [], pointers: [{ from: "main.head", to: 4096, label: "head", dangling: false }] };
    const after = { ...before, index: 1, pointers: [{ from: "main.head", to: 4112, label: "head", dangling: false }] };
    expect(nextPointerPrediction(before, after)).toEqual({ label: "main.head", expected: 4112 });
    expect(checkPrediction(4112, 4112)).toBe(true);
    expect(checkPrediction(null, 4112)).toBe(false);
  });
  it("recognizes assignments to NULL", () => {
    const before = { index: 0, line: 1, stdout: "", memory: { bytes: [], shadows: [], allocations: [] }, frames: [], pointers: [{ from: "main.head", to: 4096, label: "head", dangling: false }] };
    const after = { ...before, index: 1, pointers: [], frames: [{ name: "main", locals: { head: "null" }, variables: { head: { type: "int *", value: "null", pointer: true } } }] };
    expect(nextPointerPrediction(before, after)?.expected).toBeNull();
  });
});
