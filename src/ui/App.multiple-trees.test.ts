// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { run } from "../vm/interpreter";
import { App } from "./App";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

it("draws mirrored branches side by side in a fitted pane and preserves the earlier snapshot on rewind", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const code = `typedef struct Node { int data; struct Node *left, *right; } Node;
int main(void) {
    Node *a=calloc(1,sizeof(Node)); Node *b=calloc(1,sizeof(Node));
    Node *leafA=calloc(1,sizeof(Node)); Node *leafB=calloc(1,sizeof(Node));
    a->data=4; a->left=NULL; a->right=NULL;
    b->data=4; b->left=NULL; b->right=NULL;
    leafA->data=2; leafA->left=NULL; leafA->right=NULL;
    leafB->data=2; leafB->left=NULL; leafB->right=NULL;
    a->left=leafA;
    b->right=leafB;
}`;
  const result = run(code);
  expect(result.status).toBe("ok");
  const names = result.trace.view!.frames[0].variables!;
  const address = (name: string) => `0x${Number(names[name].value).toString(16)}`;
  const secondLink = result.trace.steps.findIndex(step => step.pointers?.some(edge => edge.from === `${address("b")}.right`));
  expect(secondLink).toBeGreaterThan(0);
  localStorage.clear();
  localStorage.setItem("memlens-code",code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const seek = (i: number) => act(() => host.querySelectorAll<HTMLButtonElement>(".event-tick")[i].click());
  const cards = () => [...host.querySelectorAll('[aria-label="tree visualization"] .diagram-node')];
  const card = (name: string) => cards().find(n=>n.textContent?.includes(`@ ${address(name)}`))!;
  const locate = (node: Element) => /translate\((\d+),(\d+)\)/.exec(node.getAttribute("transform")!)!.slice(1).map(Number);
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>(".run")!.click());
    seek(secondLink);
    expect(cards()).toHaveLength(4);
    const [a, b, left, right] = ["a", "b", "leafA", "leafB"].map(n=>locate(card(n)));
    expect(a[1]).toBe(b[1]);
    expect(left[0]).toBeLessThan(a[0]);
    expect(right[0]).toBeGreaterThan(b[0]);
    expect(left[1]).toBe(a[1]+140);
    expect(right[1]).toBe(b[1]+140);
    const viewport = host.querySelector(".diagram-viewport")!;
    Object.defineProperty(viewport,"clientWidth",{value:400});
    const fit = [...host.querySelectorAll("button")].find(button=>button.textContent==="Fit width")!;
    act(() => fit.click());
    expect(host.querySelector<HTMLDivElement>(".diagram-scaled-content")?.style.width).toBe("400px");
    seek(secondLink-1);
    expect(card("b").textContent).toContain("right → NULL");
    expect(fit.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector<HTMLDivElement>(".diagram-scaled-content")?.style.width).toBe("400px");
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});

it("separates sibling alias tags without changing their arrow targets or fit on rewind", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const code = `typedef struct Node { int data; struct Node *left, *right; } Node;
int main(void) {
    Node *root=calloc(1,sizeof(Node)), *a=calloc(1,sizeof(Node)), *b=calloc(1,sizeof(Node));
    root->left=a;
    root->right=b;
    Node *alias1=a;
    Node *alias2=a;
}`;
  const result = run(code);
  expect(result.status).toBe("ok");
  const step = result.trace.steps.findIndex(snapshot => snapshot.pointers?.some(pointer => pointer.label === "alias2"));
  expect(step).toBeGreaterThan(0);
  const vars = result.trace.steps[step].frames[0].variables!;
  const address = (name: string) => `0x${Number(vars[name].value).toString(16)}`;
  localStorage.clear();
  localStorage.setItem("memlens-code", code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const seek = (i: number) => act(() => host.querySelectorAll<HTMLButtonElement>(".event-tick")[i].click());
  const tag = (name: string) => [...host.querySelectorAll(".tag-text")].find(text=>text.textContent===name)
    ?.parentElement?.querySelector(".pointer-tag");
  const x = (node: Element, attr = "x") => Number(node.getAttribute(attr));
  const cardX = (name: string) => {
    const card = [...host.querySelectorAll(".diagram-node")].find(n=>n.textContent?.includes(`@ ${address(name)}`))!;
    return Number(card.getAttribute("transform")!.match(/translate\(([^,]+),/i)![1]);
  };
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>(".run")!.click());
    seek(step);
    const leftTag = tag("alias2")!, rightTag = tag("b")!;
    expect(leftTag.getAttribute("y")).toBe(rightTag.getAttribute("y"));
    expect(x(leftTag)+x(leftTag,"width")).toBeLessThan(x(rightTag));
    const aliasArrow = [...host.querySelectorAll("svg line.pointer-arrow")].find(line =>
      x(line,"x1") === x(leftTag)+x(leftTag,"width")/2 &&
      x(line,"y1") === x(leftTag,"y")+x(leftTag,"height"));
    expect(aliasArrow && x(aliasArrow,"x2")).toBe(cardX("a")+63);
    const viewport = host.querySelector(".diagram-viewport")!;
    Object.defineProperty(viewport,"clientWidth",{value:400});
    const fit = [...host.querySelectorAll("button")].find(button=>button.textContent==="Fit width")!;
    act(() => fit.click());
    expect(host.querySelector<HTMLDivElement>(".diagram-scaled-content")?.style.width).toBe("400px");
    seek(step-1);
    expect(tag("alias2")).toBeUndefined();
    expect(cardX("a")).toBeLessThan(cardX("root"));
    expect(cardX("b")).toBeGreaterThan(cardX("root"));
    expect(fit.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector<HTMLDivElement>(".diagram-scaled-content")?.style.width).toBe("400px");
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});
