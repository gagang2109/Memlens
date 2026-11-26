// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { run } from "../vm/interpreter";
import { App } from "./App";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

const code = `#include <stdio.h>
#define CAP 4
struct Ring { int items[CAP]; int front, rear, count; };

void add(struct Ring *q, int value) {
    q->items[q->rear] = value;
    q->rear = (q->rear + 1) % CAP;
    q->count++;
}

int pop(struct Ring *q) {
    int value = q->items[q->front];
    q->front = (q->front + 1) % CAP;
    q->count--;
    return value;
}

void show(struct Ring *q) {
    printf("front=%d next=%d count=%d physical=", q->front, q->rear, q->count);
    for (int i = 0; i < CAP; i++) printf(" %d", q->items[i]);
    printf("; fifo=");
    for (int i = 0; i < q->count; i++) printf(" %d", q->items[(q->front + i) % CAP]);
    printf("\\n");
}

int main(void) {
    struct Ring q;
    q.front = 0; q.rear = 0; q.count = 0;
    for (int i = 1; i <= CAP; i++) add(&q, i);
    pop(&q); pop(&q);
    add(&q, 5); show(&q);
    add(&q, 6); show(&q);
    while (q.count > 0) pop(&q);
    show(&q);
    return 0;
}
`;

it("separates physical cells from removal order in wrapped, full and drained states", () => {
  const r = run(code);
  expect(r.status, r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe(
    "front=2 next=1 count=3 physical= 5 2 3 4; fifo= 3 4 5\n"+
    "front=2 next=2 count=4 physical= 5 6 3 4; fifo= 3 4 5 6\n"+
    "front=2 next=2 count=0 physical= 5 6 3 4; fifo=\n");
  const find = (rear: number, count: number, second: number) => r.trace.steps.findIndex(step => {
    const v = step.frames[0]?.variables;
    return v?.["q.front"]?.value === "2" && v?.["q.rear"]?.value === String(rear) &&
      v?.["q.count"]?.value === String(count) && v?.["q.items"]?.array?.cells[0] === 5 &&
      v?.["q.items"]?.array?.cells[1] === second;
  });
  const partial = find(1,3,2), updating = find(2,3,6), full = find(2,4,6), drained = find(2,0,6);
  expect(partial).toBeGreaterThan(0);
  expect(updating).toBeGreaterThan(partial);
  expect(full).toBeGreaterThan(updating);
  expect(drained).toBeGreaterThan(full);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem("memlens-code", code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>("button.run")!.click());
    const seek = (index: number) => act(() => host.querySelector<HTMLButtonElement>(`[data-trace-index="${index}"]`)!.click());
    seek(partial);
    const section = () => host.querySelector('[aria-label="Circular queue q.items"]');
    expect(section()).toBeNull();
    act(() => [...host.querySelectorAll("button")].find(b => b.textContent === "View q.items as circular queue")!.click());
    const indexes = () => [...section()!.querySelectorAll<HTMLElement>("[data-fifo-index]")].map(el => Number(el.dataset.fifoIndex));
    const values = (selector: string) => [...section()!.querySelectorAll(`${selector} b`)].map(el => Number(el.textContent));
    expect(indexes()).toEqual([2,3,0]);
    expect(values("[data-fifo-index]")).toEqual([3,4,5]);
    expect(section()!.querySelector('[data-ring-index="1"]')?.textContent).toContain("REAR");
    seek(updating);
    expect(section()!.textContent).toContain("do not agree");
    expect(indexes()).toEqual([]);
    seek(full);
    expect(section()!.textContent).toContain("Queue is full");
    expect(indexes()).toEqual([2,3,0,1]);
    expect(values("[data-fifo-index]")).toEqual([3,4,5,6]);
    expect(values("[data-ring-index]")).toEqual([5,6,3,4]);
    expect(section()!.querySelector('[data-ring-index="2"]')?.textContent).toContain("FRONT / REAR");
    expect(section()!.querySelectorAll(".circular-occupied")).toHaveLength(4);
    seek(drained);
    expect(section()!.textContent).toContain("Queue is empty");
    expect(section()!.querySelector('[data-ring-index="2"]')?.textContent).toContain("FRONT / REAR");
    expect(values("[data-ring-index]")).toEqual([5,6,3,4]);
    expect(indexes()).toEqual([]);
    expect(section()!.querySelectorAll(".circular-occupied")).toHaveLength(0);
    seek(full);
    expect(values("[data-fifo-index]")).toEqual([3,4,5,6]);
    seek(partial);
    expect(values("[data-fifo-index]")).toEqual([3,4,5]);
    seek(0);
    expect(section()!.textContent).toContain("not in scope");
    act(() => [...section()!.querySelectorAll("button")].find(b => b.textContent === "Close queue view")!.click());
    expect(section()).toBeNull();
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});
