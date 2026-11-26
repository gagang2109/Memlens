// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { run } from "../vm/interpreter";
import { App } from "./App";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

const code = `#include <stdio.h>
#define CAP 8
struct BracketStack { char entries[CAP]; int top; };
int accepts(char *input) {
    struct BracketStack pending;
    pending.top = -1;
    for (int i = 0; input[i]; i++) {
        char c = input[i];
        if (c == '(' || c == '[') {
            if (pending.top == CAP - 1) return 0;
            pending.top++;
            pending.entries[pending.top] = c;
        } else if (c == ')' || c == ']') {
            if (pending.top < 0) return 0;
            char want = c == ')' ? '(' : '[';
            if (pending.entries[pending.top] != want) {
                printf("mismatch %c vs %c\\n", c, pending.entries[pending.top]);
                return 0;
            }
            pending.top--;
        } else return 0;
    }
    return pending.top == -1;
}
int main(void) {
    char input[9];
    if (scanf("%8s", input) != 1) return 0;
    int valid = accepts(input);
    printf("%s\\n", valid ? "balanced" : "not balanced");
    return 0;
}
`;

it.each([
  ["([])", "balanced\n"],
  ["([)]", "mismatch ) vs [\nnot balanced\n"],
  ["[", "not balanced\n"],
  ["]", "not balanced\n"],
  ["", ""],
])("matches C for nested and rejected bracket input %s", (input, expected) => {
  const result = run(code, undefined, undefined, input);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
  if (input === "([)]") {
    const mismatch = result.trace.steps.find(step => step.stdout.startsWith("mismatch"));
    const locals = mismatch?.frames.find(frame => frame.name === "accepts")?.variables;
    expect(locals?.["pending.top"].value).toBe("1");
    expect(locals?.["pending.entries"].array?.cells.slice(0, 2)).toEqual(["(", "["]);
  }
});

it("draws the actual top and rewinds while retaining popped bytes in Call Stack", () => {
  // This case has the complete bracket sequence in input-ahead mode.
  const r = run(code, undefined, undefined, "([])");
  expect(r.status, r.error?.reason).toBe("ok");
  const find = (top: string, second: string | null, start = 0) => r.trace.steps.findIndex((step, i) => {
    const v = step.frames.find(f => f.name === "accepts")?.variables;
    return i >= start && v?.["pending.top"]?.value === top && v?.["pending.entries"]?.array?.cells[1] === second;
  });
  const empty = find("-1", null), unwritten = find("1", null), pushed = find("1", "["),
    popped = find("0", "[", pushed + 1), finished = find("-1", "[", popped + 1);
  expect(empty).toBeGreaterThan(0);
  expect(unwritten).toBeGreaterThan(empty);
  expect(pushed).toBeGreaterThan(unwritten);
  expect(popped).toBeGreaterThan(pushed);
  expect(finished).toBeGreaterThan(popped);
  expect(r.trace.steps[finished].frames.find(f => f.name === "accepts")?.variables?.["pending.entries"].array?.cells.slice(0,2)).toEqual(["(", "["]);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem("memlens-code", code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(App)));
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Standard input"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "([])");
      input.dispatchEvent(new Event("input", {bubbles: true}));
    });
    act(() => host.querySelector<HTMLButtonElement>("button.run")!.click());
    const seek = (index: number) => act(() => host.querySelector<HTMLButtonElement>(`[data-trace-index="${index}"]`)!.click());
    seek(pushed);
    const button = () => [...host.querySelectorAll("button")].find(b => b.textContent === "View pending.entries as stack")!;
    const diagram = () => host.querySelector(".struct-stack-diagram");
    expect(diagram()).toBeNull();
    act(() => button().click());
    const items = () => [...diagram()!.querySelectorAll("li")];
    expect(items().map(item => item.dataset.stackIndex)).toEqual(["1", "0"]);
    expect(items()[0].textContent).toContain('"["');
    expect(items()[0].textContent).toContain("TOP");
    seek(popped);
    expect(items().map(item => item.dataset.stackIndex)).toEqual(["0"]);
    expect(items()[0].textContent).toContain('"("');
    seek(finished);
    expect(diagram()?.textContent).toContain("Stack is empty");
    seek(pushed);
    expect(items().map(item => item.dataset.stackIndex)).toEqual(["1", "0"]);
    seek(unwritten);
    expect(items()[0].textContent).toContain("not written");
    seek(empty);
    expect(diagram()?.textContent).toContain("Stack is empty");
    seek(r.trace.steps.length - 1);
    expect(diagram()?.textContent).toContain("not in scope");
    act(() => [...diagram()!.querySelectorAll("button")].find(b => b.textContent === "Close stack view")!.click());
    expect(diagram()).toBeNull();
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});
