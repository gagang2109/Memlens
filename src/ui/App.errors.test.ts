// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import * as interpreter from "../vm/interpreter";
vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
function clickRun() { act(() => container.querySelector<HTMLButtonElement>("button.run")!.click()); }
it("shows parse failures and clears stale errors when selecting a new sample", () => {
  localStorage.setItem("memlens-code", "int main( {");
  act(() => root.render(createElement(App)));
  clickRun();
  expect(container.querySelector(".crime")?.textContent).toContain("parse error:");
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Samples"]')!;
  act(() => { select.value = "stack"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.querySelector(".crime")).toBeNull();
  clickRun();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("step 1 of");
});
it("renders and runs with blocked localStorage", () => {
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("blocked"); });
  expect(() => act(() => root.render(createElement(App)))).not.toThrow();
  expect(clickRun).not.toThrow();
  expect(container.textContent).toContain("step 1 of");
});

it("displays unexpected run failures and clears them on a successful retry", () => {
  act(() => root.render(createElement(App)));
  const runSpy = vi.spyOn(interpreter, "run").mockImplementationOnce(() => { throw new Error("Unexpected runner failure"); });
  clickRun();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unexpected runner failure");
  runSpy.mockRestore();
  clickRun();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("disables playback without a trace and restores it after a successful run", () => {
  localStorage.setItem("memlens-code", "int main( {");
  act(() => root.render(createElement(App)));
  const controls = () => Array.from(container.querySelectorAll<HTMLButtonElement>(".controls > button"));
  const expectUnavailable = () => {
    expect(controls()).toHaveLength(3);
    for (const button of controls()) expect(button.disabled).toBe(true);
    act(() => controls()[0].click());
    expect(controls()[0].textContent).toContain("Play");
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    act(() => container.dispatchEvent(space));
    expect(space.defaultPrevented).toBe(false);
    expect(controls()[0].textContent).toContain("Play");
  };
  expectUnavailable();
  clickRun();
  expectUnavailable();
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Samples"]')!;
  act(() => { select.value = "factorial"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expectUnavailable();
  clickRun();
  for (const button of controls()) expect(button.disabled).toBe(false);
  act(() => controls()[0].click());
  expect(controls()[0].textContent).toContain("Pause");
  vi.spyOn(interpreter, "run").mockImplementationOnce(() => { throw new Error("runner failure"); });
  clickRun();
  expectUnavailable();
});
