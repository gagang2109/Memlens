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

it("keeps the access link at the failing iteration rather than the first matching source line", () => {
  localStorage.setItem("memlens-code", `int main() {
    int *p = malloc(sizeof(int));
    *p = 7;
    for (int i = 0; i < 2; i++) {
      if (i == 1) free(p);
      printf("%d", *p);
    }
    return 0;
  }`);
  act(() => root.render(createElement(App)));
  clickRun();
  act(() => container.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(container.querySelector(".crime")?.textContent).toContain("EXECUTION ERROR");
  const actions = [...container.querySelectorAll<HTMLButtonElement>(".crime button")].map(button => button.textContent);
  expect(actions.some(label => label?.startsWith("alloc line"))).toBe(true);
  expect(actions.some(label => label?.startsWith("free step"))).toBe(true);
  expect(container.querySelector(".step-explanation")?.textContent).toContain("step back");
  const faultCursor = container.querySelector<HTMLInputElement>('input[aria-label="Timeline"]')!.value;
  const access = Array.from(container.querySelectorAll<HTMLButtonElement>(".crime button")).find(button => button.textContent?.startsWith("access line"))!;
  act(() => access.click());
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Timeline"]')!.value).toBe(faultCursor);
  expect(container.querySelector(".crime")?.textContent).toContain("EXECUTION ERROR");
  expect(container.querySelector(".error-ahead")).toBeNull();
  // Rewinding still exposes the earlier trace and returning restores the fault.
  act(() => container.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
  expect(container.querySelector(".crime")).toBeNull();
  expect(container.querySelector(".error-ahead")).not.toBeNull();
  act(() => container.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(container.querySelector(".crime")?.textContent).toContain("EXECUTION ERROR");
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Timeline"]')!.value).toBe(faultCursor);
});

it("shows parser location and a semicolon hint without suggesting impossible rewind", () => {
  localStorage.setItem("memlens-code", "int main(void) {\n  int value = 1\n  return value;\n}");
  act(() => root.render(createElement(App)));
  clickRun();
  const panel = container.querySelector(".crime");
  expect(panel?.textContent).toContain("COULD NOT READ C CODE");
  expect(panel?.textContent).toContain("line 3: expected ';'");
  expect(panel?.querySelector("button")).toBeNull();
  const explanation = container.querySelector(".step-explanation")?.textContent ?? "";
  expect(explanation).toContain("Line 3: Memlens could not read the code, so nothing ran.");
  expect(explanation).toContain("missing semicolon");
  expect(explanation).not.toContain("step back");
  expect(container.querySelectorAll(".event-tick")).toHaveLength(1);
});

it.each(["puts", "putss"])("does not confuse an unresolved call to %s with a syntax or heap error", functionName => {
  localStorage.setItem("memlens-code", `#include <stdio.h>
int main(void) {
  ${functionName}("hello");
  return 0;
}`);
  act(() => root.render(createElement(App)));
  clickRun();
  act(() => container.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  const panel = container.querySelector(".crime");
  expect(panel?.textContent).toContain("FUNCTION NOT RESOLVED");
  expect(panel?.textContent).toContain(`could not resolve '${functionName}()'`);
  expect(panel?.textContent).toContain("Check the spelling");
  expect(panel?.textContent).toContain("library function");
  expect(panel?.textContent).toContain("line 3");
  expect(panel?.querySelector("a")?.getAttribute("href")).toMatch(/#supported-c-subset$/);
  expect(panel?.querySelector("button")).toBeNull();
});

it("maps a parse failure to the test setup rather than the source line with the same number", () => {
  localStorage.setItem("memlens-code", "int square(int x) {\n  return x * x;\n}");
  localStorage.setItem("memlens-test-setup", "int n = 2\nprintf(\"%d\", square(n));");
  act(() => root.render(createElement(App)));
  clickRun();
  expect(container.querySelector(".crime")?.textContent).toContain("test setup line 2: expected ';'");
  expect(container.querySelector(".step-explanation")?.textContent).toContain("test setup line 2: Memlens could not read");
  expect(container.querySelector(".crime")?.textContent).not.toContain("source line 2");
});

it("uses one visible free-step number in the fault, timeline, node and Quick Look", () => {
  const source = `int main(void) {
    int *p = malloc(sizeof(int));
    *p = 7;
    free(p);
    printf("%d", *p);
  }`;
  localStorage.setItem("memlens-code", source);
  act(() => root.render(createElement(App)));
  clickRun();
  act(() => container.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  const tick = container.querySelector<HTMLButtonElement>(".tick-free")!;
  const index = Array.from(container.querySelectorAll(".event-tick")).indexOf(tick);
  expect(index).toBeGreaterThan(0);
  const number = index + 1;
  expect(tick.getAttribute("aria-label")).toBe(`free tick ${number}`);
  const jump = [...container.querySelectorAll<HTMLButtonElement>(".crime button")].find(button => button.textContent?.startsWith("free step"))!;
  expect(jump.textContent).toBe(`free step ${number}`);
  act(() => jump.click());
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Timeline"]')!.value).toBe(String(index));
  expect(container.querySelector(".timeline .panel-title small")?.textContent).toMatch(new RegExp(`^step ${number} of `));
  expect(container.querySelector(".freed-node .node-address title")?.textContent).toContain(`freed at step ${number}`);
  expect(container.querySelector(".freed-node .node-address")?.textContent).toContain(`freed #${number}`);
  const inspect = container.querySelector<HTMLButtonElement>('button[aria-label="Quick Look pointer p"]')!;
  act(() => inspect.click());
  expect(container.querySelector('[aria-label="Quick Look: p"]')?.textContent).toContain(`Freed at step ${number}; not readable.`);
});
