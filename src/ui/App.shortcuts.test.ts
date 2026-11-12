// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("../vm/interpreter", () => ({ run: () => ({
  trace: { steps: [1, 2].map(line => ({ line, frames: [], memory: { allocations: [] }, stdout: "" })) },
  leaks: [],
}) }));
vi.mock("../viz/model", () => ({ renderModel: () => ({
  nodes: [], arrows: [], shape: "heap", canvasWidth: 400, canvasHeight: 100,
}) }));
vi.mock("./CodeEditor", () => ({ CodeEditor: () => (
  createElement("div", { contentEditable: true, suppressContentEditableWarning: true, "data-testid": "editor" }, createElement("span", null, "int main() {}"))
) }));

let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; localStorage.clear(); });

it("does not steal editor/control keys while keeping canvas playback shortcuts", () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  cleanup = () => { act(() => root.unmount()); container.remove(); };
  act(() => root.render(createElement(App)));
  const projectLink = container.querySelector<HTMLAnchorElement>("footer a")!;
  expect(projectLink.href).toBe("https://github.com/gagang2109/Memlens");
  expect(projectLink.rel).toContain("noopener");
  for (const key of ["ArrowLeft", "ArrowRight", "Home", "End", " "]) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    act(() => container.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(container.querySelector(".controls button")!.textContent).toContain("Play");
  }
  act(() => container.querySelector<HTMLButtonElement>("button.run")!.click());
  const timeline = container.querySelector<HTMLInputElement>('[aria-label="Timeline"]')!;
  const play = container.querySelector<HTMLButtonElement>(".controls button")!;
  const editorLine = container.querySelector('[data-testid="editor"] span')!;
  expect(timeline.value).toBe("0");

  for (const target of [editorLine, play, container.querySelector('[aria-label="Playback speed"]')!]) {
    for (const key of ["ArrowRight", "End", " "]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      act(() => target.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
      expect(timeline.value).toBe("0");
      expect(play.textContent).toContain("Play");
    }
  }

  act(() => container.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  expect(timeline.value).toBe("1");
  act(() => container.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
  expect(timeline.value).toBe("0");
  const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
  act(() => container.dispatchEvent(space));
  expect(space.defaultPrevented).toBe(true);
  expect(play.textContent).toContain("Pause");
});

// Navigation keys belong to playback only when a trace is available. Native
// scrolling must not run in addition to the selected playback action.
it("consumes handled trace navigation keys but leaves unrelated keys alone", () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  cleanup = () => { act(() => root.unmount()); container.remove(); };
  act(() => root.render(createElement(App)));
  act(() => container.querySelector<HTMLButtonElement>("button.run")!.click());
  const timeline = container.querySelector<HTMLInputElement>('[aria-label="Timeline"]')!;
  for (const [key, position] of [["End", "1"], ["Home", "0"], ["ArrowRight", "1"], ["ArrowLeft", "0"]]) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    act(() => container.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(timeline.value).toBe(position);
  }
  const unrelated = new KeyboardEvent("keydown", { key: "PageDown", bubbles: true, cancelable: true });
  act(() => container.dispatchEvent(unrelated));
  expect(unrelated.defaultPrevented).toBe(false);
});
