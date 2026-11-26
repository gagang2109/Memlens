// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { App } from "./App";
import { markerLimit } from "./traceMarkers";
import { run } from "../vm/interpreter";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

it("keeps long-trace marker and Tab counts bounded without losing exact targets", () => {
  const code = `int main(void) {
    int i = 0;
    while (i < 1000) i = i + 1;
    int *p = malloc(sizeof(int));
    *p = i;
    free(p);
    printf("%d", *p);
  }`;
  const trace = run(code).trace.steps;
  const alloc = trace.findIndex(step => step.event === "alloc");
  const free = trace.findIndex(step => step.event === "free");
  const error = trace.findIndex(step => step.event === "error");
  expect(trace.length).toBeGreaterThan(1000);
  expect(alloc).toBeGreaterThan(999);
  expect(free).toBeGreaterThan(alloc);
  expect(error).toBeGreaterThan(free);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem("memlens-code", code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>("button.run")!.click());
    const slider = host.querySelector<HTMLInputElement>('input[aria-label="Timeline"]')!;
    const ticks = [...host.querySelectorAll<HTMLButtonElement>(".event-tick")];
    expect(ticks.length).toBeLessThanOrEqual(markerLimit);
    expect(ticks.every(tick => tick.tabIndex === -1)).toBe(true);
    const tabbables = [...host.querySelectorAll<HTMLElement>(".timeline input, .timeline button, .timeline select")].filter(el => el.tabIndex >= 0 && !el.matches(":disabled"));
    expect(tabbables[0]).toBe(slider);
    expect(tabbables[1].textContent).toContain("Play");
    const at = (index: number) => {
      expect(slider.value).toBe(String(index));
      expect(slider.getAttribute("aria-valuetext")).toBe(`step ${index + 1} of ${trace.length}`);
    };
    const event = (label: string) => act(() => [...host.querySelectorAll("button")].find(button => button.textContent === label)!.click());
    at(0);
    event("Next event"); at(alloc);
    event("Next event"); at(free);
    event("Next event"); at(error);
    event("Previous event"); at(free);
    const tick = ticks.find(tick => tick.dataset.traceIndex === String(alloc))!;
    expect(tick.getAttribute("aria-label")).toBe(`alloc tick ${alloc + 1}`);
    act(() => tick.click()); at(alloc);
    const target = trace.findIndex(step => step.index > 10 && !ticks.some(tick => tick.dataset.traceIndex === String(step.index)));
    expect(target).toBeGreaterThan(10);
    expect(ticks.some(tick => tick.dataset.traceIndex === String(target))).toBe(false);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, String(target));
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    at(target);
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});
