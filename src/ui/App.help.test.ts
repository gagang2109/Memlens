// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, expect, it } from "vitest";
import { App } from "./App";

let host: HTMLDivElement, root: Root;
const code = "int main(){int n=1; n++; printf(\"%d\",n);}";
const main = () => host.querySelector("main")!;
const help = () => host.querySelector<HTMLButtonElement>(".help-trigger")!;
const dialog = () => host.querySelector<HTMLElement>(".workspace-help");
const dismiss = () => [...dialog()!.querySelectorAll("button")].find(button => button.textContent === "Dismiss")!;
const region = () => dialog()!.querySelector<HTMLElement>(".help-body")!;
function key(target: EventTarget, key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
  act(() => target.dispatchEvent(event));
  return event;
}
beforeEach(() => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem("memlens-code", code);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  act(() => root.render(createElement(App)));
});
afterEach(() => { act(() => root.unmount()); host.remove(); localStorage.clear(); });

it("opens a single shortcuts and usage panel from ? or the Help button, with focus and dismissal", () => {
  act(() => main().focus());
  expect(key(main(), "/").defaultPrevented).toBe(false);
  expect(key(main(), "?", {shiftKey:true, code:"Slash"}).defaultPrevented).toBe(true);
  expect(dialog()?.getAttribute("role")).toBe("dialog");
  expect(dialog()?.getAttribute("aria-modal")).toBe("true");
  expect(dialog()?.textContent).toContain("Shift + Enter");
  expect(dialog()?.textContent).toContain("Read the diagram");
  expect(host.textContent).not.toContain("READING MEMORY");
  expect(dialog()?.textContent).toContain("Space");
  expect(host.querySelector(".usage-help,.editor-shortcuts,.trace-keys")).toBeNull();
  expect(help().getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(region());
  const readme = dialog()!.querySelector<HTMLAnchorElement>("a")!;
  expect(readme.href).toBe("https://github.com/gagang2109/Memlens#readme");
  expect(host.querySelector<HTMLAnchorElement>("footer a")?.href).toBe("https://github.com/gagang2109/Memlens");
  expect(key(region(), "Tab").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(readme);
  key(readme, "Tab");
  const report = dialog()!.querySelector<HTMLAnchorElement>('a[href$="/issues"]')!;
  expect(document.activeElement).toBe(report);
  expect(report.href).toBe("https://github.com/gagang2109/Memlens/issues");
  expect(dialog()?.textContent).toContain("nothing is attached automatically");
  key(report, "Tab");
  const quickTour = [...dialog()!.querySelectorAll("button")].find(button => button.textContent === "Start tutorial")!;
  expect(document.activeElement).toBe(quickTour);
  key(quickTour, "Tab");
  expect(document.activeElement).toBe(dismiss());
  expect(key(dismiss(), "Tab").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(region());
  key(region(), "Tab", {shiftKey:true});
  expect(document.activeElement).toBe(dismiss());
  key(dismiss(), "Tab");
  key(region(), "Escape");
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(main());

  act(() => help().click());
  act(() => dismiss().click());
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(help());
  act(() => help().click());
  act(() => host.querySelector(".help-scrim")!.dispatchEvent(new Event("pointerdown", {bubbles:true,cancelable:true})));
  expect(dialog()).toBeNull();
  expect(document.activeElement).toBe(help());
});

it("leaves question marks native in editor and input, and ignores other modifiers and dialogs", () => {
  const editor = host.querySelector<HTMLElement>(".cm-content")!;
  const view = EditorView.findFromDOM(editor)!;
  act(() => view.focus());
  expect(key(editor, "?", {shiftKey:true, code:"Slash"}).defaultPrevented).toBe(false);
  expect(view.state.doc.toString()).toBe(code);
  for (const target of [
    host.querySelector('[aria-label="Standard input"]')!, host.querySelector('[aria-label="C test setup"]')!,
    host.querySelector('[aria-label="Samples"]')!,
  ]) expect(key(target, "?", {shiftKey:true}).defaultPrevented).toBe(false);
  for (const modifier of [{ctrlKey:true}, {altKey:true}, {metaKey:true}, {repeat:true}, {isComposing:true}]) {
    expect(key(main(), "?", {shiftKey:true, ...modifier}).defaultPrevented).toBe(false);
  }
  key(main(), "k", {ctrlKey:true});
  const spotlight = host.querySelector('[role="combobox"]')!;
  expect(spotlight).not.toBeNull();
  expect(key(spotlight, "?", {shiftKey:true}).defaultPrevented).toBe(false);
  expect(dialog()).toBeNull();
  key(spotlight, "Escape");
  expect(dialog()).toBeNull();
});

it("pauses playback when opening Help and does not change steps while reading it", () => {
  act(() => host.querySelector<HTMLButtonElement>(".run")!.click());
  const timeline = host.querySelector<HTMLInputElement>('[aria-label="Timeline"]')!;
  const play = host.querySelector(".controls button")!;
  key(main(), " ");
  expect(play.textContent).toContain("Pause");
  key(main(), "?", {shiftKey:true});
  expect(play.textContent).toContain("Play");
  key(region(), "ArrowRight");
  key(region(), "Enter", {ctrlKey:true});
  expect(timeline.value).toBe("0");
  key(region(), "Escape");
  expect(play.textContent).toContain("Play");
});
