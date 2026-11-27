// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import program from "../../tests/labs/converted-list/rewire.c?raw";
import { run } from "../vm/interpreter";
import { App } from "./App";

vi.mock("./CodeEditor", () => ({CodeEditor: () => null}));

it("offers a deliberate list view, keeps true C fields, and goes back to tree during rewind", () => {
  const result = run(program);
  expect(result.status, result.error?.reason).toBe("ok");
  const before = result.trace.steps.find(s => s.line === 13 && s.frames.at(-1)?.name === "main")!.index;
  const after = result.trace.steps.find(s => s.line === 14 && s.frames.at(-1)?.name === "main")!.index;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); localStorage.setItem("memlens-code", program);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const button = (copy: string) => [...host.querySelectorAll("button")].find(button => button.textContent === copy);
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>("button.run")!.click());
    const seek = (index: number) => act(() => host.querySelector<HTMLButtonElement>(`[data-trace-index="${index}"]`)!.click());
    seek(before);
    expect(button("View head as doubly linked list")).toBeUndefined();
    expect(host.querySelector(".structure-diagram.tree")).not.toBeNull();
    seek(after);
    expect(host.querySelector(".structure-diagram.tree")).not.toBeNull();
    act(() => button("View head as doubly linked list")!.click());
    const list = host.querySelector(".structure-diagram.doubly-linked-list");
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll(".diagram-node")).toHaveLength(3);
    expect(list?.querySelectorAll('[data-pointer-route="prev"]')).toHaveLength(2);
    expect(list?.textContent).toContain("lchild → NULL");
    expect(list?.textContent).toContain("rchild → NULL");
    seek(before);
    expect(host.querySelector(".structure-diagram.tree")).not.toBeNull();
    expect(host.textContent).toContain("is not complete at this step");
    seek(after);
    expect(host.querySelector(".structure-diagram.doubly-linked-list")).not.toBeNull();
    act(() => button("Back to automatic heap view")!.click());
    expect(host.querySelector(".structure-diagram.tree")).not.toBeNull();
  } finally {
    act(() => root.unmount()); host.remove(); localStorage.clear();
  }
});
