// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { App } from "./App";
import { run } from "../vm/interpreter";
import { stepChanges } from "./stepChanges";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));
it("highlights a real array cell, pointer and heap field and clears the later change on rewind", () => {
  const code = `typedef struct Node { int data; struct Node *next; } Node;
int main(void) {
  int a[2][3] = {0};
  Node *head = malloc(sizeof(Node));
  Node *tail = malloc(sizeof(Node));
  Node *p = head;
  head->data=1;
  head->next=NULL;
  tail->next=NULL;
  a[1][2]=9;
  head->next=tail;
  p=tail;
}`;
  const result = run(code);
  expect(result.status, result.error?.reason).toBe("ok");
  const steps = result.trace.steps;
  const delta = (i: number) => stepChanges(steps[i-1], steps[i]);
  const cell = steps.findIndex((_,i) => delta(i).frames.get(0)?.has("a"));
  const link = steps.findIndex((_,i) => [...delta(i).heap.values()].some(value=>value.includes("next: NULL → 0x")));
  const pointer = steps.findIndex((_,i) => delta(i).frames.get(0)?.has("p"));
  expect(cell).toBeGreaterThan(0);
  expect(link).toBeGreaterThan(cell);
  expect(pointer).toBeGreaterThan(link);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem("memlens-code",code);
  const host=document.body.appendChild(document.createElement("div"));
  const root=createRoot(host);
  const seek = (i: number) => act(() => host.querySelectorAll<HTMLButtonElement>(".event-tick")[i].click());
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>("button.run")!.click());
    seek(cell);
    const changed = host.querySelectorAll(".step-changed-cell");
    expect(changed).toHaveLength(1);
    expect(changed[0].getAttribute("title")).toBe("[1][2]: 0 → 9");
    seek(link);
    expect(host.querySelector(".step-changed-cell")).toBeNull();
    expect(host.querySelector(".step-changed-node > title")?.textContent).toMatch(/^next: NULL → 0x/);
    seek(pointer);
    expect(host.querySelector(".step-changed-slot code")?.getAttribute("title")).toMatch(/^0x[\da-f]+ → 0x[\da-f]+$/);
    seek(cell);
    expect(host.querySelector(".step-changed-cell")?.getAttribute("title")).toBe("[1][2]: 0 → 9");
    expect(host.querySelector(".step-changed-node")).toBeNull();
    seek(cell-1);
    expect(host.querySelector(".step-changed-cell")).toBeNull();
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});
