// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { App } from "./App";
import { run } from "../vm/interpreter";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

it("shows real FRONT and REAR through empty, singleton, multiple and drained queue steps", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const code = `typedef struct Node { int value; struct Node *next; } Node;
int main(void) {
  Node *rear = NULL; Node *front = NULL;
  Node *a=calloc(1,sizeof(Node)); a->value=12;
  Node *b=calloc(1,sizeof(Node)); b->value=34;
  rear=front=a;
  a->next=b; rear=b;
  front=rear=NULL; free(a); free(b);
}`;
  localStorage.clear();
  localStorage.setItem("memlens-code",code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const steps = run(code).trace.steps;
  const frames = (i: number) => steps[i].frames[0]?.variables;
  const empty = steps.findIndex((_,i) => frames(i)?.front?.value === "null" && frames(i)?.rear?.value === "null");
  const singleton = steps.findIndex((_,i) => frames(i)?.front?.value === "4096" && frames(i)?.rear?.value === "4096");
  const multiple = steps.findIndex((_,i) => frames(i)?.front?.value === "4096" && frames(i)?.rear?.value === "4112");
  const getDiagram = () => host.querySelector('[aria-label="queue visualization"]')!;
  const click = (button: HTMLButtonElement) => act(() => button.click());
  const seek = (index: number) => click(host.querySelectorAll<HTMLButtonElement>(".event-tick")[index]);
  const ends = () => Array.from(getDiagram().querySelectorAll(".queue-endpoint code"), node => node.textContent);
  try {
    act(() => root.render(createElement(App)));
    click(host.querySelector<HTMLButtonElement>(".run")!);
    seek(empty);
    expect(ends()).toEqual(["NULL","NULL"]);
    expect(getDiagram().textContent).toContain("Queue is empty");
    seek(singleton);
    expect(ends()).toEqual(["0x1000","0x1000"]);
    expect(getDiagram().textContent).toContain("same node");
    seek(multiple);
    expect(ends()).toEqual(["0x1000","0x1010"]);
    expect(Array.from(getDiagram().querySelectorAll("svg .queue-endpoint-tag text"),node=>node.textContent)).toEqual(["REAR","FRONT"]);
    expect(getDiagram().textContent).toContain("next → 0x1010");
    seek(steps.length - 1);
    expect(ends()).toEqual(["NULL","NULL"]);
    expect(getDiagram().querySelectorAll(".freed-node")).toHaveLength(2);
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});
