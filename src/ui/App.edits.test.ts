// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
vi.mock("./CodeEditor", () => ({ CodeEditor: ({ onChange, currentLine }: { onChange: (code: string) => void; currentLine?: number }) => createElement("button", { "data-line": currentLine, className: "edit-code", onClick: () => onChange('int main() { printf("new"); return 0; }') }, "Edit code") }));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  act(() => root.render(createElement(App)));
});
afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.clear(); });
function click(selector: string) { act(() => container.querySelector<HTMLButtonElement>(selector)!.click()); }

function expectStale() {
  expect(container.querySelector('[role="status"]')?.textContent).toContain("previous run");
  expect(container.querySelector<HTMLInputElement>('[aria-label="Timeline"]')!.disabled).toBe(false);
  expect(container.querySelector(".edit-code")!.hasAttribute("data-line")).toBe(false);
  expect(container.querySelector(".controls")!.textContent).toContain("Play");
  expect(container.querySelector<HTMLInputElement>('.predict-toggle input')!.disabled).toBe(true);
}
function setInput(value: string) {
  const input = container.querySelector<HTMLInputElement>('[aria-label="Standard input"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("labels retained results and pauses playback when source changes; rerun clears the label", () => {
  click(".run");
  const ticks = container.querySelectorAll(".event-tick").length;
  click(".controls button");
  click(".edit-code");
  expectStale();
  expect(container.querySelectorAll(".event-tick").length).toBe(ticks);
  expect(container.querySelector(".error-ahead")).not.toBeNull();
  click(".run");
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.querySelector(".error-ahead")).toBeNull();
  expect(container.querySelector(".edit-code")!.hasAttribute("data-line")).toBe(true);
});
it("marks input edits stale without deleting results and recognizes restored input", () => {
  click(".run");
  setInput("3 4");
  expectStale();
  setInput("");
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.querySelector(".edit-code")!.hasAttribute("data-line")).toBe(true);
});
it("does not label edits before the first run as stale", () => {
  click(".edit-code");
  setInput("3");
  expect(container.querySelector('[role="status"]')).toBeNull();
});
it("clears stale state when selecting a new sample", () => {
  click(".run");
  click(".edit-code");
  const select = container.querySelector<HTMLSelectElement>('[aria-label="Samples"]')!;
  act(() => { select.value = "tree"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.querySelector<HTMLInputElement>('[aria-label="Timeline"]')!.disabled).toBe(true);
});
it("cancels old playback on edit and allows explicit review of the labelled old trace", () => {
  vi.useFakeTimers();
  try {
    click(".run"); click(".controls button");
    click(".edit-code");
    const timeline = container.querySelector<HTMLInputElement>('[aria-label="Timeline"]')!;
    act(() => { vi.advanceTimersByTime(2000); });
    expect(timeline.value).toBe("0");
    click(".controls button");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(timeline.value).toBe("1");
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  } finally { vi.useRealTimers(); }
});
