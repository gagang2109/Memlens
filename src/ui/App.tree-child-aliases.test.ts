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

it.each([["lchild", "rchild"], ["llink", "rlink"]])("draws a BST using %s/%s and the actual addresses", (left, right) => {
  const source = code.replaceAll("lchild", left).replaceAll("rchild", right);
  const result = run(source);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("2 4 6 ");
  expect(result.leaks).toHaveLength(0);
  const first = result.trace.steps.findIndex(step => step.frames.length === 1 && step.heap?.length === 1 &&
    renderModel(step).shape === "tree");
  const latest = result.trace.steps.findIndex(step => step.frames.length === 1 &&
    step.pointers?.some(edge => edge.label === left) && step.pointers.some(edge => edge.label === right));
  expect(first).toBeGreaterThan(0);
  expect(latest).toBeGreaterThan(first);
  const nodes = renderModel(result.trace.steps[latest]).nodes;
  const addresses = nodes.map(node => node.label);
  expect(nodes[1].x).toBeLessThan(nodes[0].x);
  expect(nodes[2].x).toBeGreaterThan(nodes[0].x);

  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem("memlens-code",source);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const seek = (index: number) => act(() => host.querySelectorAll<HTMLButtonElement>(".event-tick")[index].click());
  const cards = () => [...host.querySelectorAll('[aria-label="tree visualization"] .diagram-node')];
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>(".run")!.click());
    seek(latest);
    expect(cards()).toHaveLength(3);
    expect(cards()[0].textContent).toContain(`${left} → ${addresses[1]}`);
    expect(cards()[0].textContent).toContain(`${right} → ${addresses[2]}`);
    seek(first);
    expect(cards()).toHaveLength(1);
    expect(cards()[0].textContent).toContain(`${left} → NULL`);
    expect(cards()[0].textContent).toContain(`${right} → NULL`);
    expect(cards()[0].textContent).toContain(addresses[0]);
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});

it.each([
  ["struct Node { int lchild, rchild; };", "root->lchild=4096; root->rchild=4128;"],
  ["struct Node { int *lchild,*rchild; };", "root->lchild=NULL; root->rchild=NULL;"],
  ["struct Node { int lthread,rthread; struct Node *lchild,*rchild; };",
    "root->lthread=1; root->rthread=1; root->lchild=NULL; root->rchild=root;"],
  ["struct Node { int llink, rlink; };", "root->llink=4096; root->rlink=4128;"],
  ["struct Node { int *llink,*rlink; };", "root->llink=NULL; root->rlink=NULL;"],
  ["struct Node { int ltag,rtag; struct Node *llink,*rlink; };",
    "root->ltag=1; root->rtag=1; root->llink=NULL; root->rlink=root;"],
  ["struct Node { struct Node *llink,*rlink,*lchild,*rchild; };",
    "root->llink=NULL; root->rlink=root; root->lchild=NULL; root->rchild=NULL;"],
])("does not guess structural edges for %s", (declaration, body) => {
  const result = run(`${declaration}
    int main(void) { struct Node *root=malloc(sizeof(struct Node)); ${body} }`);
  expect(result.status, result.error?.reason).toBe("ok");
  const model = renderModel(result.trace.steps.at(-1)!);
  expect(model.shape).not.toBe("tree");
  expect(model.arrows.some(arrow => ["lchild", "rchild", "llink", "rlink"].includes(arrow.label))).toBe(false);
});
