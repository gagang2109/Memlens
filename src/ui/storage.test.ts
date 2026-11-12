// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { readSavedCount, saveCount } from "./storage";
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
it("reads valid counts and rejects malformed saved values", () => {
  expect(readSavedCount("score")).toBe(0);
  for (const value of ["NaN", "Infinity", "-1", "1.5", "9007199254740992"]) {
    localStorage.setItem("score", value);
    expect(readSavedCount("score")).toBe(0);
  }
  saveCount("score", 12);
  expect(readSavedCount("score")).toBe(12);
});
it("tolerates blocked storage access", () => {
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("blocked"); });
  expect(readSavedCount("score")).toBe(0);
  expect(() => saveCount("score", 1)).not.toThrow();
});
it("tolerates storage quota errors", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  expect(() => saveCount("score", 1)).not.toThrow();
});
