// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { quickTourSource, tourPreference } from "./QuickTour";
import { samples } from "../samples";

let root: Root, host: HTMLElement;
const draft = 'int f(void) { return 12; }';
const setup = 'printf("%d", f());';
const click = (text: string) => {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text);
  expect(button, text).toBeDefined();
  act(() => button!.click());
};
const mount = () => { root = createRoot(host); act(() => root.render(createElement(App))); };
const reload = () => { act(() => root.unmount()); mount(); };
const editor = () => EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-content")!)!;
const source = () => editor().state.doc.toString();
const currentSetup = () => host.querySelector<HTMLTextAreaElement>("#test-setup")!.value;
const stage = (n: number) => expect(host.querySelector("main")!.dataset.tourStep).toBe(String(n));

const key = (target: EventTarget, value: string, modifiers: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...modifiers });
  act(() => target.dispatchEvent(event)); return event;
};
const speed = () => host.querySelector<HTMLSelectElement>('[aria-label="Playback speed"]')!;
const setSpeed = (value: string) => act(() => { speed().value = value; speed().dispatchEvent(new Event("change", { bubbles: true })); });
const workspace = () => host.querySelector("main")!;
const timeline = () => host.querySelector<HTMLInputElement>('[aria-label="Timeline"]')!;
const currentCell = () => host.querySelector('[data-array="values"] [data-cell="[0]"]');
function forwardUntilChange(advance: () => void) {
  for (let i = 0; i < 16 && workspace().dataset.tourStep === "3"; i++) advance();
  stage(4);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  host = document.body.appendChild(document.createElement("div"));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); window.history.replaceState(null, "", "/"); });

it("shows an optional welcome, exercises real Run and trace steps, and remembers completion", () => {
  mount();
  expect(host.querySelector(".tour-welcome")?.textContent).toContain("See your C code");
  expect(host.querySelector(".tour-hint")).toBeNull();
  click("Start quick tour");
  stage(1);
  expect(source()).toBe(quickTourSource);
  act(() => editor().focus()); stage(2);
  click("Run"); stage(3);
  forwardUntilChange(() => click("step forward →"));
  expect(host.querySelector('[data-tour-target="changed-value"]')?.getAttribute("title")).toBe("[0]: 2 → 5");
  expect(host.querySelector(".tour-hint")?.textContent).toContain("values[0] changed from 2 to 5");
  click("Next"); stage(5);
  click("← step back"); stage(6);
  expect(currentCell()?.textContent).toBe("[0]2");
  click("Play ▶"); expect(host.textContent).toContain("Pause");
  setSpeed("2"); click("Next"); stage(7);
  click("Finish");
  expect(source()).toBe(samples.requested.code);
  expect(localStorage.getItem(tourPreference)).toBe("yes");
  reload();
  expect(host.querySelector(".tour-welcome,.tour-hint")).toBeNull();
});

it("asks before replacing custom code, skips midway, restores without altering the previous backup, and reopens in Help", () => {
  const other = JSON.stringify({code:"older",setup:"other"});
  localStorage.setItem("memlens-code", draft); localStorage.setItem("memlens-test-setup", setup);
  localStorage.setItem("memlens-previous-draft", other);
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
  mount();
  click("Start quick tour");
  expect(source()).toBe(draft); expect(currentSetup()).toBe(setup);
  expect(host.querySelector(".tour-hint")).toBeNull();
  click("Start quick tour"); stage(1);
  act(() => editor().focus()); stage(2);
  click("Exit tour");
  expect(source()).toBe(draft); expect(currentSetup()).toBe(setup);
  expect(localStorage.getItem("memlens-previous-draft")).toBe(other);
  expect(host.querySelector(".tour-welcome,.tour-hint")).toBeNull();
  act(() => host.querySelector<HTMLButtonElement>(".help-trigger")!.click());
  click("Start tutorial"); stage(1);
  expect(confirm).toHaveBeenCalledTimes(3);
  reload();
  expect(source()).toBe(draft); expect(currentSetup()).toBe(setup);
  expect(host.querySelector(".tour-hint")).toBeNull();
});

it("skips straight to the normal workspace without touching the draft or starting a run", () => {
  localStorage.setItem("memlens-code", draft); localStorage.setItem("memlens-test-setup", setup);
  mount();
  click("Skip and start coding");
  expect(source()).toBe(draft); expect(currentSetup()).toBe(setup);
  expect(host.querySelector(".tour-welcome,.tour-hint,.event-tick")).toBeNull();
  reload();
  expect(host.querySelector(".tour-welcome")).toBeNull();
});

it("never opens over a shared sample, and requires permission before temporarily showing the tour", () => {
  window.history.replaceState(null, "", "/#sample=tree-swap");
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  mount();
  expect(host.querySelector(".tour-welcome")).toBeNull();
  click("Load sample");
  expect(source()).toBe(samples["tree-swap"].code);
  expect(host.querySelector(".tour-welcome")).toBeNull();
  act(() => host.querySelector<HTMLButtonElement>(".help-trigger")!.click());
  click("Start tutorial"); expect(source()).toBe(samples["tree-swap"].code);
  click("Start tutorial"); stage(1);
  click("Exit tour"); expect(source()).toBe(samples["tree-swap"].code);
});

it("offers the welcome only once even if refreshed before making a choice", () => {
  mount();
  expect(host.querySelector(".tour-welcome")).not.toBeNull();
  expect(localStorage.getItem(tourPreference)).toBe("offered");
  reload();
  expect(host.querySelector(".tour-welcome,.tour-hint")).toBeNull();
  act(() => host.querySelector<HTMLButtonElement>(".help-trigger")!.click());
  expect(host.querySelector(".help-tour")?.textContent).toContain("New to Memlens? Take the quick tour");
  expect(host.querySelector(".tour-hint")).toBeNull();
  click("Start tutorial"); stage(1);
});

it("keeps the workspace usable even if browser storage throws", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage disabled"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage disabled"); });
  mount();
  click("Skip and start coding");
  expect(host.querySelector(".tour-welcome")).toBeNull();
  click("Run");
  expect(host.querySelector('[aria-label="Timeline"]')?.getAttribute("aria-valuetext")).toContain("step 1");
  act(() => host.querySelector<HTMLButtonElement>(".help-trigger")!.click());
  click("Start tutorial"); stage(1);
  click("Exit tour");
  expect(host.querySelector(".tour-hint")).toBeNull();
});


it.each([false, true])("accepts editor keyboard run/play, arrows, and Space (auto=%s)", auto => {
  mount();
  click("Start quick tour"); act(() => editor().focus()); stage(2);
  const content = host.querySelector(".cm-content")!;
  key(content, "Enter", auto ? { shiftKey: true } : { ctrlKey: true }); stage(3);
  expect(host.textContent).toContain(auto ? "Pause" : "Play");
  forwardUntilChange(() => key(workspace(), "ArrowRight"));
  click("Next"); key(workspace(), "ArrowLeft"); stage(6);
  key(workspace(), " "); expect(host.textContent).toContain("Pause");
  expect(key(workspace(), "+", {code:"Equal",shiftKey:true}).defaultPrevented).toBe(true);
  expect(speed().value).toBe("2");
  click("Next"); stage(7); click("Finish");
  expect(speed().value).toBe("1");
});

it("restores a previously recorded trace, speed and layout after a tour", () => {
  mount(); click("Run"); click("step forward →"); const priorPosition = timeline().value;
  setSpeed("4");
  const layout = host.querySelector<HTMLSelectElement>("#workspace-layout")!;
  const chooseLayout = (name: string) => act(() => { layout.value = name; layout.dispatchEvent(new Event("change", { bubbles: true })); });
  chooseLayout("balanced");
  click("Start quick tour"); expect(speed().value).toBe("1");
  chooseLayout("writing"); setSpeed("0.5");
  click("Exit tour");
  expect(speed().value).toBe("4"); expect(layout.value).toBe("balanced");
  expect(timeline().value).toBe(priorPosition);
});

it("changes speed in-place during playback without starting it while paused", () => {
  vi.useFakeTimers();
  localStorage.setItem("memlens-code", quickTourSource);
  mount(); click("Run"); expect(timeline().value).toBe("0");
  expect(key(workspace(), "+", {shiftKey: true, code: "Equal"}).defaultPrevented).toBe(true);
  expect(speed().value).toBe("2");
  expect(host.querySelector(".speed-feedback")?.textContent).toBe("Playback speed: 2×");
  act(() => vi.advanceTimersByTime(900)); expect(timeline().value).toBe("0");
  click("Play ▶"); const play = host.querySelector<HTMLButtonElement>('[data-playback-speed-keys]')!;
  key(play, "+", { code: "NumpadAdd" });
  expect(speed().value).toBe("4"); expect(timeline().value).toBe("0");
  act(() => vi.advanceTimersByTime(249)); expect(timeline().value).toBe("0");
  act(() => vi.advanceTimersByTime(1)); expect(timeline().value).toBe("1");
  key(workspace(), "="); expect(speed().value).toBe("1"); expect(timeline().value).toBe("1");
  act(() => vi.advanceTimersByTime(999)); expect(timeline().value).toBe("1");
  act(() => vi.advanceTimersByTime(1)); expect(timeline().value).toBe("2");
  click("Pause ▶"); key(workspace(), "-", {code:"NumpadSubtract"}); key(workspace(), "-");
  expect(speed().value).toBe("0.5");
  act(() => vi.advanceTimersByTime(1700));
  expect(timeline().value).toBe("2");
  expect(host.querySelector(".speed-feedback")?.textContent).toBe("");
});

it("does not intercept speed keys in the editor, console, menu or browser zoom", () => {
  mount();
  for (const selector of [".cm-content", '#test-setup', '[aria-label="Standard input"]', '[aria-label="Playback speed"]']) {
    const target=host.querySelector(selector)!;
    for (const value of ["+","-","="]) expect(key(target,value).defaultPrevented).toBe(false);
  }
  expect(key(workspace(),"+",{ctrlKey:true}).defaultPrevented).toBe(false);
  expect(key(workspace(),"-",{metaKey:true}).defaultPrevented).toBe(false);
  expect(speed().value).toBe("1");
});

it("keeps a single accessible floating card outside the workspace panels", () => {
  mount();
  expect(host.querySelector<HTMLDialogElement>("dialog.tour-welcome")?.open).toBe(true);
  click("Start quick tour");
  const panel = host.querySelector(".workspace")!;
  expect(panel.querySelector(".tour-hint")).toBeNull();
  const card = host.querySelector(".tour-hint")!;
  expect(card.getAttribute("aria-labelledby")).toBeTruthy();
  expect(card.querySelector(".tour-progress")?.textContent).toContain("1 of 6");
  expect(card.querySelectorAll(".tour-dots i")).toHaveLength(6);
  click("Skip step"); stage(2);
  expect(host.querySelector(".tour-key-rows")?.textContent).toContain("Shift+Enter");
  click("Skip step"); stage(3);
  click("Skip step"); stage(4);
  expect(host.querySelector('[data-tour-target="changed-value"]')?.getAttribute("title")).toBe("[0]: 2 → 5");
  click("Next"); stage(5);
  click("Skip step"); stage(6);
  click("Skip step"); stage(7);
  click("Finish");
  expect(source()).toBe(samples.requested.code);
});

it("lets Escape dismiss the first-visit dialog without starting the tour", () => {
  mount();
  const welcome = host.querySelector<HTMLDialogElement>("dialog")!;
  act(() => welcome.dispatchEvent(new Event("cancel", {cancelable:true})));
  expect(host.querySelector(".tour-welcome,.tour-hint")).toBeNull();
  expect(localStorage.getItem(tourPreference)).toBe("yes");
});

it("provides a keyboard-usable editor action in the floating card", () => {
  mount();
  click("Start quick tour"); stage(1);
  click("Focus editor"); stage(2);
  expect(document.activeElement).toBe(host.querySelector(".cm-content"));
});
