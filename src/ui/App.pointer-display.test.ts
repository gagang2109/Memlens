// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));
let container: HTMLDivElement; let root: Root;
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear(); container = document.body.appendChild(document.createElement("div")); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.clear(); });
function show(body: string) {
  localStorage.setItem("memlens-code", `int main(){${body}}`);
  act(() => root.render(createElement(App)));
  act(() => container.querySelector<HTMLButtonElement>("button.run")!.click());
  act(() => container.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
}
function slot(name: string) { return [...container.querySelectorAll<HTMLElement>(".stack-slot")].find(node => node.querySelector("b")?.textContent === name)!; }
it.each(["hello", "123", "4096", "0", "null", "", "[1, 2]", "<img src=x onerror=alert(1)>"])("renders string-backed pointer %j without inventing an address or array", value => {
  show(`char *s=${JSON.stringify(value)};printf("%s",s);`);
  expect(slot("s").querySelector("code")?.textContent).toBe(`string ${JSON.stringify(value)}`);
  expect(slot("s").querySelector(".array-cells")).toBeNull();
  expect(slot("s").querySelector("img")).toBeNull();
});
it("keeps real heap pointers hexadecimal and clears their highlight when a numeric string is selected", () => {
  show('char *p=malloc(4);char *s="4096";char *n=NULL;int a[2]={1,2};');
  expect(slot("p").querySelector("code")?.textContent).toBe("0x1000");
  expect(slot("n").querySelector("code")?.textContent).toBe("null");
  expect(slot("a").querySelectorAll(".array-cell")).toHaveLength(2);
  act(() => slot("p").click());
  expect(container.querySelector(".highlighted-node")).not.toBeNull();
  act(() => slot("s").click());
  expect(container.querySelector(".highlighted-node")).toBeNull();
});
