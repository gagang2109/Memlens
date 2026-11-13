// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";

const state = vi.hoisted(() => ({ count: 0 }));
vi.mock("../vm/interpreter", () => ({ run: () => ({
  trace: { steps: [{ line: 1, frames: [], memory: { allocations: [] }, stdout: "" }] },
  leaks: Array.from({ length: state.count }, (_, index) => ({ address: index + 1, line: index + 2 })),
}) }));
vi.mock("../viz/model", () => ({ renderModel: () => ({
  nodes: [], arrows: [], shape: "heap", canvasWidth: 400, canvasHeight: 100,
}) }));
vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; localStorage.clear(); });

it.each([
  [0, null],
  [1, "1 block was never freed."],
  [2, "2 blocks were never freed."],
])("renders the correct leak summary for %i allocations", (count, expected) => {
  state.count = count;
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  cleanup = () => { act(() => root.unmount()); container.remove(); };
  act(() => root.render(createElement(App)));
  act(() => container.querySelector<HTMLButtonElement>("button.run")!.click());
  expect(container.querySelector(".leak-report span")?.textContent ?? null).toBe(expected);
  expect(container.querySelectorAll(".leak-report small")).toHaveLength(count);
});
