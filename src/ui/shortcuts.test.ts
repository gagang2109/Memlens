// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { playbackSpeeds, playbackSpeedShortcut, shouldHandlePlaybackShortcut, stepPlaybackSpeed } from "./shortcuts";

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

function speedOn(element: Element, options: KeyboardEventInit) {
  let direction: ReturnType<typeof playbackSpeedShortcut>;
  element.addEventListener("keydown", event => {
    direction = playbackSpeedShortcut(event as KeyboardEvent);
  }, { once: true });
  element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...options }));
  return direction;
}

describe("playback speed key ownership", () => {
  it.each<[KeyboardEventInit, -1 | 0 | 1]>([
    [{ key: "-" }, -1],
    [{ key: "=", code: "Equal" }, 0],
    [{ key: "+", code: "Equal", shiftKey: true }, 1],
    [{ key: "+" }, 1],
    [{ key: "-", code: "NumpadSubtract" }, -1],
    [{ key: "+", code: "NumpadAdd" }, 1],
  ])("maps the typed key (not a physical layout) %j", (options, expected) => {
    expect(speedOn(document.createElement("div"), options)).toBe(expected);
  });

  it("ignores other keys, modifiers, browser zoom, composition and key repeat", () => {
    const target = document.createElement("div");
    for (const options of [
      { key: "_", code: "Minus", shiftKey: true },
      { key: "=", shiftKey: true },
      { key: "+", ctrlKey: true },
      { key: "-", metaKey: true },
      { key: "=", altKey: true },
      { key: "+", isComposing: true },
      { key: "+", repeat: true },
      { key: "?" },
    ]) expect(speedOn(target, options)).toBeUndefined();
    const event = new KeyboardEvent("keydown", { key: "+", cancelable: true });
    event.preventDefault();
    expect(playbackSpeedShortcut(event)).toBeUndefined();
  });

  it("does not claim editing, dialog, native control or diagram-control input", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <div contenteditable="plaintext-only"><span></span></div>
      <input><textarea></textarea><select></select><button><span></span></button>
      <summary></summary><a href="#speed"></a>
      <div role="searchbox"></div><div role="slider"></div><div role="separator"></div>
      <div role="dialog"><span></span></div><div data-run-shortcut="ignore"></div>
      <div class="diagram-viewport"><span></span></div>
      <button data-step-navigation="true"><span></span></button>
    `;
    for (const target of host.querySelectorAll("*")) {
      for (const key of ["-", "=", "+"]) expect(speedOn(target, { key })).toBeUndefined();
    }
    expect(dispatchTo(host.querySelector('[data-step-navigation] span')!, { key: "ArrowRight" })).toBe(true);
  });

  it("steps through the select speeds, clamps at both ends and resets from every stop", () => {
    expect(playbackSpeeds.map(speed => stepPlaybackSpeed(speed, 1))).toEqual([1, 2, 4, 4]);
    expect(playbackSpeeds.map(speed => stepPlaybackSpeed(speed, -1))).toEqual([0.5, 0.5, 1, 2]);
    expect(playbackSpeeds.map(speed => stepPlaybackSpeed(speed, 0))).toEqual([1, 1, 1, 1]);
    expect(stepPlaybackSpeed(NaN, 1)).toBe(2);
    expect(stepPlaybackSpeed(NaN, -1)).toBe(0.5);
  });
});
