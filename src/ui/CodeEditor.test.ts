// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import { CodeEditor } from "./CodeEditor";

let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); vi.restoreAllMocks(); });
function mount() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const showLine = (currentLine?: number) => act(() => root.render(createElement(CodeEditor, { value: "int main() {\n  return 0;\n}", currentLine, onChange: () => {} })));
  showLine();
  cleanup = () => { act(() => root.unmount()); container.remove(); };
  const content = container.querySelector<HTMLElement>(".cm-content")!;
  const editor = EditorView.findFromDOM(content)!;
  function key(key: string, extra: KeyboardEventInit = {}) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
    act(() => content.dispatchEvent(event));
    return event;
  }
  return { container, content, editor, key, showLine };
}
it("follows a trace line inside the editor without moving the user's selection", () => {
  const { container, editor, showLine } = mount();
  act(() => editor.dispatch({ selection: { anchor: 2, head: 6 } }));
  const scroller = editor.scrollDOM;
  Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 20 });
  vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 200, 20));
  vi.spyOn(editor, "documentTop", "get").mockReturnValue(100);
  const from = editor.state.doc.line(3).from;
  const block = editor.lineBlockAt(from);
  vi.spyOn(editor, "lineBlockAt").mockReturnValue(Object.create(block, {
    top: { value: 60 }, bottom: { value: 72 },
  }));
  const measure = vi.spyOn(editor, "requestMeasure");
  container.scrollTop = 7;
  showLine(3);
  const follow = measure.mock.calls.map(([request]) => request).find(request => request?.key && request.write);
  expect(follow).toBeDefined();
  follow!.write!(follow!.read(editor), editor);
  expect(scroller.scrollTop).toBe(52);
  expect(container.scrollTop).toBe(7);
  expect(editor.state.selection.main.anchor).toBe(2);
  expect(editor.state.selection.main.head).toBe(6);
  expect(container.querySelector(".cm-memlens-current")?.textContent).toBe("}");
});
it("comments with Ctrl+/ and keeps Tab native in the source editor", () => {
  const { container, content, editor, key } = mount();
  expect(container.querySelector(".cm-lineNumbers")).not.toBeNull();
  expect(content.getAttribute("aria-label")).toBe("C source editor");
  expect(key("/", { ctrlKey: true }).defaultPrevented).toBe(true);
  expect(editor.state.doc.toString()).toContain("// int main()");
  expect(key("Tab").defaultPrevented).toBe(false);
});
it("supports alternate comment, undo and search keymaps", () => {
  const { container, editor, key } = mount();
  key("a", { altKey: true, keyCode: 65 });
  expect(editor.state.doc.toString()).not.toContain("//");
  key("A", { altKey: true, shiftKey: true, keyCode: 65 });
  expect(editor.state.doc.toString()).toContain("// int main()");
  key("z", { ctrlKey: true });
  expect(editor.state.doc.toString()).not.toContain("//");
  key("Z", { ctrlKey: true, shiftKey: true, keyCode: 90 });
  expect(editor.state.doc.toString()).toContain("// int main()");
  key("f", { ctrlKey: true });
  expect(container.querySelector(".cm-search")).not.toBeNull();
});
it("supports the documented line editing shortcuts", () => {
  const { editor, key } = mount();
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
