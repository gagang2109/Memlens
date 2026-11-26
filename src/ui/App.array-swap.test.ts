// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { run } from "../vm/interpreter";
import { App } from "./App";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

const program = (call: string) => `#include <stdio.h>
void swap(int *x, int *y) { int saved=*x; *x=*y; *y=saved; }
void pass(int *a) { swap(&a[0], &a[1]); }
int main(void) {
  int a[3]={4,1,8};
  ${call}
  printf("%d %d %d",a[0],a[1],a[2]);
  return 0;
}`;
it.each(["swap(&a[0], &a[1]);", "pass(a);"])("swaps live caller cells for %s", call => {
  const r = run(program(call));
  expect(r.status, r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("1 4 8");
});

it("highlights actual array writes from a nested helper and restores them on rewind", () => {
  const code = program("pass(a);");
  const r = run(code);
  const states = ["4,1,8", "1,1,8", "1,4,8"].map(expected => r.trace.steps.findIndex(
    step => step.frames[0].variables?.a?.array?.cells.join(",") === expected));
  expect(states.every(i => i > 0)).toBe(true);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); localStorage.setItem("memlens-code",code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>("button.run")!.click());
    const seek = (index: number) => act(() => host.querySelector<HTMLButtonElement>(`[data-trace-index="${index}"]`)!.click());
    const changed = () => [...host.querySelectorAll('[data-array="a"] .step-changed-cell')].map(el=>el.getAttribute("title"));
    const values = () => [...host.querySelectorAll('[data-array="a"] .array-cell')].map(el=>el.lastChild?.textContent);
    seek(states[1]); expect(changed()).toEqual(["[0]: 4 → 1"]); expect(values()).toEqual(["1","1","8"]);
    seek(states[2]); expect(changed()).toEqual(["[1]: 1 → 4"]); expect(values()).toEqual(["1","4","8"]);
    seek(states[1]); expect(changed()).toEqual(["[0]: 4 → 1"]); expect(values()).toEqual(["1","1","8"]);
    seek(states[0]); expect(changed()).toEqual([]); expect(values()).toEqual(["4","1","8"]);
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});

it("does not use the cell after its owner's function returns", () => {
  const r = run(`void save(int **out) { int a[2]={3,4}; *out=&a[1]; }
  int main(void) { int *p=NULL; save(&p); printf("%d",*p); return 0; }`);
  expect(r.status).toBe("error"); expect(r.error?.reason).toContain("outside its lifetime");
});

it.each([
  ["int *p=&a[2];", "array index out of bounds"],
  ["{ int b[1]={7}; int *p=&b[0]; printf(\"%d\",*p); }", "invalid pointer dereference"],
])("retains bounds and unsupported inner-block behavior for %s", (body, reason) => {
  const r = run(`int main(void) { int a[2]={3,4}; ${body} return 0; }`);
  expect(r.status).toBe("error"); expect(r.error?.reason).toContain(reason);
});
