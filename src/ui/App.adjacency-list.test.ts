// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { App } from "./App";
import { run } from "../vm/interpreter";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

const code = `
struct Link { int dest; struct Link *next; };
int main(void) {
  struct Link *heads[50] = {NULL};
  struct Link *a = malloc(16), *b = malloc(16);
  a->dest = 1; a->next = NULL; heads[0] = a;
  printf("one");
  b->dest = 2; b->next = heads[0]; heads[0] = b;
  printf("two");
  return 0;
}
`;

it("shows the selected count and head-to-next order through rewind", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem("memlens-code", code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    const steps = run(code).trace.steps;
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>("button.run")!.click());
    const seek = (prefix: string) => {
      const i = steps.find(step => step.stdout === prefix)!.index;
      act(() => host.querySelector<HTMLButtonElement>('button[data-trace-index="' + i + '"]')!.click());
    };
    seek("onetwo");
    const click = (label: string) => act(() => [...host.querySelectorAll("button")].find(b => b.textContent === label)!.click());
    click("View heads as adjacency list");
    const graph = host.querySelector('[aria-label="Adjacency graph"]')!;
    expect(graph.querySelector('svg')).toBeNull();
    const select = graph.querySelector("select")!;
    act(() => { select.value = "5"; select.dispatchEvent(new Event("change", { bubbles:true })); });
    expect(graph.querySelectorAll("[data-vertex]")).toHaveLength(5);
    const rows = graph.querySelectorAll("li");
    const values = () => Array.from(graph.querySelectorAll("li:first-child strong"), node => node.textContent);
    expect(rows[4].textContent).toContain("NULL");
    expect(values()).toEqual(["2","1"]);
    seek("one");
    expect(values()).toEqual(["1"]);
    seek("onetwo");
    expect(values()).toEqual(["2","1"]);
    click("Close graph");
    expect(host.querySelector('[aria-label="Adjacency graph"]')).toBeNull();
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});
