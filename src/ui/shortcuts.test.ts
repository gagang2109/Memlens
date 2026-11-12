// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { shouldHandlePlaybackShortcut } from "./shortcuts";

function dispatchTo(element: Element, options: KeyboardEventInit = {}): boolean {
  let handled = false;
  const listener = (event: Event) => { handled = shouldHandlePlaybackShortcut(event as KeyboardEvent); };
  element.addEventListener("keydown", listener);
  element.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true, ...options }));
  element.removeEventListener("keydown", listener);
  return handled;
}

describe("playback keyboard ownership", () => {
  it("leaves CodeMirror contenteditable text and its nested elements alone", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const line = editor.appendChild(document.createElement("span"));
    for (const key of [" ", "ArrowLeft", "ArrowRight", "Home", "End"]) {
      expect(dispatchTo(editor, { key })).toBe(false);
      expect(dispatchTo(line, { key })).toBe(false);
    }
  });

  it("preserves native controls and their descendants", () => {
    for (const tag of ["input", "textarea", "select", "button"]) {
      const control = document.createElement(tag);
      expect(dispatchTo(control)).toBe(false);
      expect(dispatchTo(control.appendChild(document.createElement("span")))).toBe(false);
    }
    const link = document.createElement("a");
    link.href = "#help";
    expect(dispatchTo(link)).toBe(false);
    const textbox = document.createElement("div");
    textbox.setAttribute("role", "textbox");
    expect(dispatchTo(textbox)).toBe(false);
  });

  it("respects composition, modifiers, and another handler's cancellation", () => {
    for (const options of [{ isComposing: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(dispatchTo(document.createElement("div"), options)).toBe(false);
    }
    const event = new KeyboardEvent("keydown", { key: " ", cancelable: true });
    event.preventDefault();
    expect(shouldHandlePlaybackShortcut(event)).toBe(false);
  });

  it("still allows ordinary playback shortcuts outside controls", () => {
    const canvas = document.createElement("div");
    for (const key of [" ", "ArrowLeft", "ArrowRight", "Home", "End"]) {
      expect(dispatchTo(canvas, { key })).toBe(true);
    }
    canvas.setAttribute("contenteditable", "false");
    expect(dispatchTo(canvas)).toBe(true);
  });
});
