// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DiagramViewport } from "./DiagramViewport";
let cleanup: () => void;
afterEach(() => cleanup?.());
function mount() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const highlight = vi.fn();
  act(() => root.render(createElement(DiagramViewport, { width: 1000, height: 500, children: createElement("svg", null, createElement("g", { className: "diagram-node", onClick: highlight })) })));
  cleanup = () => { act(() => root.unmount()); container.remove(); };
  const viewport = container.querySelector<HTMLDivElement>(".diagram-viewport")!;
  viewport.setPointerCapture = vi.fn(); viewport.releasePointerCapture = vi.fn();
  const click = (text: string) => act(() => Array.from(container.querySelectorAll("button")).find(button => button.textContent === text)!.click());
  const pointer = (type: string, target: Element, x: number, pointerType = "mouse") => act(() => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, button: 0, clientX: x, clientY: x, pointerType });
    target.dispatchEvent(event);
  });
  return { container, viewport, click, pointer, highlight };
}
it("bounds zoom, fits to available width, and resets scrolling", () => {
  const { container, viewport, click } = mount();
  for (let i=0;i<15;i++) click("+");
  expect(container.querySelector("output")!.textContent).toBe("300%");
  for (let i=0;i<15;i++) click("−");
  expect(container.querySelector("output")!.textContent).toBe("25%");
  Object.defineProperty(viewport, "clientWidth", { value: 600 });
  click("Fit width"); expect(container.querySelector("output")!.textContent).toBe("60%");
  viewport.scrollLeft=120; viewport.scrollTop=40;
  click("Reset view"); expect(viewport.scrollLeft).toBe(0); expect(viewport.scrollTop).toBe(0);
  expect(container.querySelector("output")!.textContent).toBe("100%");
});
it("pans empty space, stops on cancellation, preserves node clicks and native touch scrolling", () => {
  const { container, viewport, pointer, highlight } = mount();
  pointer("pointerdown", viewport, 100); pointer("pointermove", viewport, 50);
  expect(viewport.scrollLeft).toBe(50);
  pointer("pointercancel", viewport, 50); pointer("pointermove", viewport, 0);
  expect(viewport.scrollLeft).toBe(50);
  const node = container.querySelector("g")!;
  pointer("pointerdown", node, 100); pointer("pointermove", viewport, 20);
  expect(viewport.scrollLeft).toBe(50);
  act(() => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(highlight).toHaveBeenCalledOnce();
  pointer("pointerdown", viewport, 100, "touch"); pointer("pointermove", viewport, 0, "touch");
  expect(viewport.scrollLeft).toBe(50);
});
it("keeps keyboard scrolling local rather than stepping the interpreter", () => {
  const { container, viewport } = mount();
  const outer = vi.fn(); window.addEventListener("keydown", outer);
  const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
  act(() => viewport.dispatchEvent(event));
  window.removeEventListener("keydown", outer);
  expect(outer).not.toHaveBeenCalled(); expect(event.defaultPrevented).toBe(false);
});
