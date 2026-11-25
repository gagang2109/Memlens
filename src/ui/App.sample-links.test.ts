// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { readSampleLink } from "./SampleShare";
import { samples } from "../samples";

vi.mock("./CodeEditor", () => ({
  CodeEditor: ({ value }: { value: string }) => createElement("pre", { "data-editor": true }, value),
}));
let host: HTMLDivElement;
let root: Root;
const locate = <T extends HTMLElement = HTMLElement>(selector: string) => host.querySelector<T>(selector);
const button = (label: string) => [...host.querySelectorAll("button")].find(node => node.textContent === label)!;
const click = (label: string) => act(() => button(label).click());
const render = () => act(() => root.render(createElement(App)));
const route = (url: string) => window.history.replaceState(null, "", url);
const sourceKey = "memlens-code", setupKey = "memlens-test-setup";
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  route("/");
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); localStorage.clear(); route("/"); vi.restoreAllMocks(); });

it("opening a shared sample preserves source and setup until the user confirms", () => {
  localStorage.setItem(sourceKey, 'int main(){printf("my code");}');
  localStorage.setItem(setupKey, "int my_setup = 42;");
  route("/?keep=1#sample=factorial");
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  render();
  expect(locate(".linked-sample")?.textContent).toContain("Factorial recursion");
  expect(locate("[data-editor]")?.textContent).toContain("my code");
  expect(localStorage.getItem(sourceKey)).toContain("my code");
  expect(localStorage.getItem(setupKey)).toBe("int my_setup = 42;");
  click("Load sample");
  expect(locate(".linked-sample")).not.toBeNull();
  expect(localStorage.getItem(setupKey)).toBe("int my_setup = 42;");
  click("Load sample");
  expect(locate(".linked-sample")).toBeNull();
  expect(document.activeElement).toBe(locate('[aria-label="Samples"]'));
  expect(locate("[data-editor]")?.textContent).toBe(samples.factorial.code);
  expect(localStorage.getItem(sourceKey)).toBe(samples.factorial.code);
  expect(localStorage.getItem(setupKey)).toBe("");
  expect(window.location.search).toBe("?keep=1");
  expect(window.location.hash).toBe("");
  expect(confirm).toHaveBeenCalledTimes(2);
});

it("loads and runs the Factorial demo, and shares only its built-in identifier", () => {
  route("/?tracking=ignored#sample=factorial");
  render();
  expect(locate("[data-editor]")?.textContent).not.toBe(samples.factorial.code);
  click("Load sample");
  expect(locate<HTMLInputElement>(".sample-share input")?.value).toBe(window.location.origin + "/#sample=factorial");
  click("Run");
  const ticks = host.querySelectorAll<HTMLButtonElement>(".event-tick");
  act(() => ticks[ticks.length - 1].click());
  expect(locate(".console-output pre")?.textContent).toBe("120");
});

it("ignores unknown identifiers and supports dismissing a subsequent link", () => {
  expect(readSampleLink("#sample=constructor")).toBeUndefined();
  expect(readSampleLink("#sample=factorial&extra=x")).toBeUndefined();
  route("/#sample=missing");
  render();
  expect(locate(".linked-sample")).toBeNull();
  act(() => {
    route("/#sample=queue");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(locate(".linked-sample")?.textContent).toContain("Linked queue");
  click("Dismiss");
  expect(locate(".linked-sample")).toBeNull();
  expect(locate("[data-editor]")?.textContent).toBe(samples.requested.code);
});

it("copies the clean link and selects it when clipboard permission is denied", async () => {
  render();
  locate<HTMLDetailsElement>(".sample-share")!.open = true;
  const input = locate<HTMLInputElement>(".sample-share input")!;
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("denied"));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    await act(async () => { button("Copy link").click(); });
    expect(writeText).toHaveBeenCalledWith(window.location.origin + "/#sample=requested");
    expect(locate('.sample-share [aria-live="polite"]')?.textContent).toBe("Link copied.");
    await act(async () => { button("Copy link").click(); });
    expect(document.activeElement).toBe(input);
    expect(input.selectionEnd).toBe(input.value.length);
  } finally {
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});
