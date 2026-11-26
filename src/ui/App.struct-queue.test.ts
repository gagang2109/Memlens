// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { run } from "../vm/interpreter";
import { App } from "./App";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

it("opts into the recorded linear range and restores its exact ends and values on rewind", () => {
  const code = `struct Ring { int a[3]; int front, rear; };
  void add(struct Ring *p, int v) { if (p->front == -1) p->front = 0; p->rear = p->rear+1; p->a[p->rear] = v; }
  int main(void) {
    struct Ring q; q.front = -1; q.rear = -1;
    add(&q, 7); add(&q, 4);
    q.front++; q.rear = -1; q.front = -1;
    return 0;
  }`;
  const r = run(code);
  expect(r.status, r.error?.reason).toBe("ok");
  const snapshot = (front: string, rear: string, cell: number | null) => r.trace.steps.findIndex(step => {
    const v = step.frames[0].variables;
    return v?.["q.front"]?.value === front && v?.["q.rear"]?.value === rear && v?.["q.a"]?.array?.cells[1] === cell;
  });
  const initial = snapshot("-1", "-1", null), beforeWrite = snapshot("0", "1", null),
    both = snapshot("0", "1", 4), afterPop = snapshot("1", "1", 4), transition = snapshot("1", "-1", 4);
  expect([initial, beforeWrite, both, afterPop, transition].every(i => i > 0)).toBe(true);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem("memlens-code", code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>("button.run")!.click());
    const seek = (index: number) => act(() => host.querySelector<HTMLButtonElement>(`[data-trace-index="${index}"]`)!.click());
    seek(both);
    expect(host.querySelector(".struct-queue-diagram")).toBeNull();
    act(() => [...host.querySelectorAll("button")].find(b => b.textContent === "View q.a as linear queue")!.click());
    const diagram = () => host.querySelector(".struct-queue-diagram")!;
    expect(diagram().querySelector('[data-queue-index="0"]')?.textContent).toBe("FRONT7[0]");
    expect(diagram().querySelector('[data-queue-index="1"]')?.textContent).toBe("REAR4[1]");
    seek(afterPop);
    expect(diagram().querySelector('[data-queue-index="0"]')).toBeNull();
    expect(diagram().querySelector('[data-queue-index="1"]')?.textContent).toBe("FRONT / REAR4[1]");
    seek(transition);
    expect(diagram().textContent).toContain("No valid linear range");
    seek(both);
    expect(diagram().querySelector('[data-queue-index="0"]')?.textContent).toBe("FRONT7[0]");
    seek(beforeWrite);
    expect(diagram().querySelector('[data-queue-index="1"]')?.textContent).toBe("REARnot written[1]");
    seek(initial);
    expect(diagram().textContent).toContain("Queue is empty");
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});
