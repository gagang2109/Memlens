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
it.each([false,true])("keeps raw block address within its card (freed=%s)", freed => {
  show(`int *values=malloc(12); values[0]=42; ${freed ? 'free(values);' : ''}`);
  const node=container.querySelector('.diagram-node')!;
  const address=node.querySelector('.node-address')!;
  expect(Number(node.querySelector('rect')!.getAttribute('height'))).toBe(78);
  expect(Number(address.getAttribute('y'))).toBe(70);
  expect(address.querySelector('title')?.textContent).toContain('Simulated address 0x1000');
  const caption=[...address.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE).map(child=>child.textContent).join('');
  if (freed) expect(caption).toMatch(/^0x1000 freed #\d+$/);
  else expect(caption).toBe("@ 0x1000");
  if(freed) expect(address.querySelector('title')?.textContent).toMatch(/freed at step \d+/);
});
