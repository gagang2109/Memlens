// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { EditorView } from "@codemirror/view";
import { CodeEditor } from "./CodeEditor";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());
function mount() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  act(() => root.render(createElement(CodeEditor, { value: "int main() {\n  return 0;\n}", onChange: () => {} })));
  cleanup = () => { act(() => root.unmount()); container.remove(); };
  const content = container.querySelector<HTMLElement>(".cm-content")!;
  const editor = EditorView.findFromDOM(content)!;
  function key(key: string, extra: KeyboardEventInit = {}) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
    act(() => content.dispatchEvent(event));
    return event;
  }
  return { container, content, editor, key };
}
it("comments with Ctrl+/, opens help from the bottom button, and preserves accessible focus", () => {
  const { container, content, editor, key } = mount();
  expect(container.querySelector(".cm-lineNumbers")).not.toBeNull();
  expect(content.getAttribute("aria-label")).toBe("C source editor");
  expect(key("/", { ctrlKey: true }).defaultPrevented).toBe(true);
  expect(container.querySelector("#editor-shortcuts")).toBeNull();
  expect(editor.state.doc.toString()).toContain("// int main()");
  act(() => container.querySelector<HTMLButtonElement>(".editor-status button")!.click());
  expect(container.querySelector("#editor-shortcuts")).not.toBeNull();
  act(() => container.querySelector<HTMLButtonElement>(".editor-shortcuts button")!.click());
  expect(container.querySelector("#editor-shortcuts")).toBeNull();
  expect(document.activeElement).toBe(content);
  expect(key("Tab").defaultPrevented).toBe(false);
});
it("supports alternate comment, undo and search keymaps", () => {
  const { container, editor, key } = mount();
  key("A", { altKey: true, shiftKey: true, keyCode: 65 });
  expect(editor.state.doc.toString()).toContain("// int main()");
  key("z", { ctrlKey: true });
  expect(editor.state.doc.toString()).not.toContain("//");
  key("Z", { ctrlKey: true, shiftKey: true, keyCode: 90 });
  expect(editor.state.doc.toString()).toContain("// int main()");
  key("f", { ctrlKey: true });
  expect(container.querySelector(".cm-search")).not.toBeNull();
});
it("toggles help repeatedly without changing code and supports documented line editing", () => {
  const { container, editor, key } = mount();
  for (let count = 0; count < 4; count++) act(() => container.querySelector<HTMLButtonElement>(".editor-status button")!.click());
  expect(container.querySelector("#editor-shortcuts")).toBeNull();
  key("]", { ctrlKey: true });
  expect(editor.state.doc.toString()).toMatch(/^  int main/);
  key("[", { ctrlKey: true });
  expect(editor.state.doc.toString()).toMatch(/^int main/);
  key("ArrowDown", { altKey: true });
  expect(editor.state.doc.line(1).text).toBe("  return 0;");
  key("a", { ctrlKey: true });
  expect(editor.state.selection.main.from).toBe(0);
  expect(editor.state.selection.main.to).toBe(editor.state.doc.length);
});
