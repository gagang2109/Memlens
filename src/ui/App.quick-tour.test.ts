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

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  host = document.body.appendChild(document.createElement("div"));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); localStorage.clear(); window.history.replaceState(null, "", "/"); });

it("shows an optional welcome, exercises real Run and trace steps, and remembers completion", () => {
  mount();
  expect(host.querySelector(".tour-welcome")?.textContent).toContain("Welcome to Memlens");
  expect(host.querySelector(".tour-hint")).toBeNull();
  click("Start quick tour");
  stage(1);
  expect(source()).toBe(quickTourSource);
  act(() => editor().focus()); stage(2);
  click("Run"); stage(3);
  click("step forward →"); stage(3);
  click("step forward →"); stage(4);
  expect(host.querySelector('[data-tour-target="changed-value"] code')?.getAttribute("title")).toBe("2 → 5");
  click("Next"); stage(5);
  click("← step back"); stage(6);
  expect([...host.querySelectorAll(".stack-slot code")].some(e => e.textContent === "2")).toBe(true);
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
