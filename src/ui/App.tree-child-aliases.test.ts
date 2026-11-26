// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { App } from "./App";
import { run } from "../vm/interpreter";
import { renderModel } from "../viz/model";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

const code = `#include <stdio.h>
#include <stdlib.h>
typedef struct Node { int key; struct Node *lchild, *rchild; } Node;

Node *insert(Node *root, int key) {
  if (!root) {
    root=malloc(sizeof(Node));
    root->key=key;
    root->lchild=NULL;
    root->rchild=NULL;
  } else if (key < root->key) root->lchild=insert(root->lchild,key);
  else if (key > root->key) root->rchild=insert(root->rchild,key);
  return root;
}
void inorder(Node *root) {
  if (!root) return;
  inorder(root->lchild);
  printf("%d ",root->key);
  inorder(root->rchild);
}
void destroy(Node *root) {
  if (!root) return;
  destroy(root->lchild);
  destroy(root->rchild);
  free(root);
}
int main(void) {
  Node *root=NULL;
  root=insert(root,4);
  root=insert(root,2);
  root=insert(root,6);
  inorder(root);
  destroy(root);
  return 0;
}`;

it("draws an unchanged BST lab using its actual child field names and addresses", () => {
  const result = run(code);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("2 4 6 ");
  expect(result.leaks).toHaveLength(0);
  const first = result.trace.steps.findIndex(step => step.frames.length === 1 && step.heap?.length === 1 &&
    renderModel(step).shape === "tree");
  const latest = result.trace.steps.findIndex(step => step.frames.length === 1 &&
    step.pointers?.some(edge => edge.label === "lchild") && step.pointers.some(edge => edge.label === "rchild"));
  expect(first).toBeGreaterThan(0);
  expect(latest).toBeGreaterThan(first);
  const nodes = renderModel(result.trace.steps[latest]).nodes;
  const addresses = nodes.map(node => node.label);
  expect(nodes[1].x).toBeLessThan(nodes[0].x);
  expect(nodes[2].x).toBeGreaterThan(nodes[0].x);

  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem("memlens-code",code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const seek = (index: number) => act(() => host.querySelectorAll<HTMLButtonElement>(".event-tick")[index].click());
  const cards = () => [...host.querySelectorAll('[aria-label="tree visualization"] .diagram-node')];
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>(".run")!.click());
    seek(latest);
    expect(cards()).toHaveLength(3);
    expect(cards()[0].textContent).toContain(`lchild → ${addresses[1]}`);
    expect(cards()[0].textContent).toContain(`rchild → ${addresses[2]}`);
    seek(first);
    expect(cards()).toHaveLength(1);
    expect(cards()[0].textContent).toContain("lchild → NULL");
    expect(cards()[0].textContent).toContain("rchild → NULL");
    expect(cards()[0].textContent).toContain(addresses[0]);
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});

it.each([
  ["struct Node { int lchild, rchild; };", "root->lchild=4096; root->rchild=4128;"],
  ["struct Node { int *lchild,*rchild; };", "root->lchild=NULL; root->rchild=NULL;"],
  ["struct Node { int lthread,rthread; struct Node *lchild,*rchild; };",
    "root->lthread=1; root->rthread=1; root->lchild=NULL; root->rchild=root;"],
])("does not guess structural edges for %s", (declaration, body) => {
  const result = run(`${declaration}
    int main(void) { struct Node *root=malloc(sizeof(struct Node)); ${body} }`);
  expect(result.status, result.error?.reason).toBe("ok");
  const model = renderModel(result.trace.steps.at(-1)!);
  expect(model.shape).not.toBe("tree");
  expect(model.arrows.some(arrow => arrow.label === "lchild" || arrow.label === "rchild")).toBe(false);
});
