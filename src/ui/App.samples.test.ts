// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { App } from "./App";
vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));
it("discloses the default example's intentional error and clears the note for another sample", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    act(() => root.render(createElement(App)));
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Samples"]')!;
    expect(select.selectedOptions[0].textContent).toContain("intentional use-after-free");
    expect(container.querySelector('[role="note"]')?.textContent).toContain("not Memlens");
    act(() => { select.value = "tree"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector('[role="note"]')).toBeNull();
  } finally { act(() => root.unmount()); localStorage.clear(); }
});
it("does not describe restored custom code as an intentional-error example", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("memlens-code", "int main() { return 0; }");
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    act(() => root.render(createElement(App)));
    expect(container.querySelector('[role="note"]')).toBeNull();
  } finally { act(() => root.unmount()); localStorage.clear(); }
});
