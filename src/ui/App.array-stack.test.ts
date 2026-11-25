// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { run } from "../vm/interpreter";
import { samples } from "../samples";
import { starterScaffolds } from "../starterScaffolds";
import { App } from "./App";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear(); });
afterEach(() => localStorage.clear());

it.each([samples.stack.code, starterScaffolds.stack.code])("shows the stack in LIFO order and rewinds across a pop (%#)", code => {
  const result = run(code);
  expect(result.status).toBe("ok");
  const snapshots = result.trace.steps;
  const activeTop = (i: number) => snapshots[i].frames.find(frame => frame.variables?.stack?.value.startsWith("["))?.variables?.top?.value;
  const empty = snapshots.findIndex((_,i) => activeTop(i) === "-1");
  const full = snapshots.findIndex((step,i) => activeTop(i) === "2" && !!step.frames.find(frame => frame.variables?.stack?.value.startsWith("[10, 20, 30")));
  const popped = snapshots.findIndex((_,i) => i > full && activeTop(i) === "1");
  expect(empty).toBeGreaterThanOrEqual(0);
  expect(full).toBeGreaterThan(empty);
  expect(popped).toBeGreaterThan(full);
  localStorage.setItem("memlens-code", code);
  const host = document.createElement("div");
  const root = createRoot(host);
  const click = (button: HTMLButtonElement) => act(() => button.click());
  const runButton = () => [...host.querySelectorAll("button")].find(button => button.textContent === "Run")!;
  const seek = (index: number) => click(host.querySelectorAll<HTMLButtonElement>(".event-tick")[index]);
  const diagram = () => host.querySelector('[aria-label="Array stack diagram"]')!;
  const items = () => Array.from(diagram().querySelectorAll(".array-stack-cell b"), element => element.textContent);
  try {
    act(() => root.render(createElement(App)));
    expect(diagram()).toBeNull();
    click(runButton());
    seek(empty);
    expect(diagram().textContent).toContain("Empty stack");
    expect(items()).toEqual([]);
    seek(full);
    expect(items()).toEqual(["30", "20", "10"]);
    expect(diagram().querySelector("li")?.textContent).toContain("TOP");
    seek(popped);
    expect(items()).toEqual(["20", "10"]);
    expect(Array.from(host.querySelectorAll(".array-cell")).some(cell => cell.textContent === "[2]30")).toBe(true);
    seek(full);
    expect(items()).toEqual(["30", "20", "10"]);
  } finally { act(() => root.unmount()); }
});

it("does not infer the stack convention of arbitrary arrays named stack", () => {
  localStorage.setItem("memlens-code", "int main() { int stack[3] = {10, 20, 0}; int top = 2; return 0; }");
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(App)));
    act(() => [...host.querySelectorAll("button")].find(button => button.textContent === "Run")!.click());
    const ticks = host.querySelectorAll<HTMLButtonElement>(".event-tick");
    act(() => ticks[ticks.length - 1].click());
    expect(host.querySelector('[aria-label="Array stack diagram"]')).toBeNull();
    expect(host.querySelector(".array-cells")).not.toBeNull();
  } finally { act(() => root.unmount()); }
});
