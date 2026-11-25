// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { App } from "./App";
import { run } from "../vm/interpreter";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

it("shows a list cycle and a self-link outside the nodes, and removes them when rewinding", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const code = `typedef struct Node { int value; struct Node *next; } Node;
int main(void) {
  Node *head=calloc(1,sizeof(Node)); head->value=12;
  Node *tail=calloc(1,sizeof(Node)); tail->value=34;
  head->next=tail;
  tail->next=head;
  tail->next=tail;
}`;
  const trace = run(code);
  expect(trace.status).toBe("ok");
  const {steps} = trace.trace;
  const findTailNext = (address: number) => steps.findIndex(step => step.pointers?.some(pointer => pointer.from === "0x1010.next" && pointer.to === address));
  const cycle = findTailNext(4096), self = findTailNext(4112);
  expect(cycle).toBeGreaterThan(0);
  expect(self).toBeGreaterThan(cycle);
  localStorage.clear();
  localStorage.setItem("memlens-code",code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const seek = (index: number) => act(() => host.querySelectorAll<HTMLButtonElement>(".event-tick")[index].click());
  const route = () => host.querySelector('path[data-pointer-route="return"]');
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>(".run")!.click());
    seek(cycle);
    const back = route()!;
    const backPath = back.getAttribute("d");
    expect(back.textContent).toBe("0x1010.next → 0x1000");
    expect(back.getAttribute("marker-end")).toBe("url(#arrow)");
    expect(backPath).toContain("V183"); // enters at the bottom of the 78px node
    expect(host.querySelector('[aria-label="singly-linked-list visualization"]')!.textContent).toContain("next → 0x1000");
    seek(self);
    expect(route()!.textContent).toBe("0x1010.next → 0x1010 (same node)");
    expect(route()!.getAttribute("d")).not.toBe(backPath);
    seek(cycle - 1);
    expect(route()).toBeNull();
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});
