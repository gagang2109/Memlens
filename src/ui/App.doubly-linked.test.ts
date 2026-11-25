// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

it("renders independent next and prev arrows and labels on a doubly linked list", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const code = `typedef struct Node { int data; struct Node *next, *prev; } Node;
int main(void) {
  Node *a=calloc(1,sizeof(Node)); Node *b=calloc(1,sizeof(Node));
  a->data=1; b->data=2; a->next=b; b->prev=a; a->prev=NULL; b->next=NULL; a=NULL;
}`;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  localStorage.clear();
  localStorage.setItem("memlens-code",code);
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>(".run")!.click());
    const end = [...host.querySelectorAll<HTMLButtonElement>(".event-tick")].at(-1)!;
    act(() => end.click());
    const diagram = host.querySelector('[aria-label="doubly-linked-list visualization"]')!;
    expect(diagram.textContent).toContain("prev → 0x1000");
    expect(diagram.textContent).toContain("next → 0x1010");
    const backwards = diagram.querySelector('path[data-pointer-route="prev"]')!;
    expect(backwards.textContent).toBe("0x1010.prev → 0x1000");
    expect(backwards.getAttribute("marker-end")).toBe("url(#prev-arrow)");
    const forwards = [...diagram.querySelectorAll("line.pointer-arrow")].find(line => line.getAttribute("y1") === line.getAttribute("y2"));
    expect(forwards?.getAttribute("marker-end")).toBe("url(#arrow)");
    expect(diagram.querySelectorAll(".orphan-node")).toHaveLength(0);
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});
