// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { App } from "./App";
import { run } from "../vm/interpreter";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

const code = `int main(void) {
  int **marks=malloc(3*sizeof *marks);
  marks[0]=malloc(2*sizeof **marks);
  marks[1]=malloc(3*sizeof **marks);
  marks[0][0]=901; marks[0][1]=-300;
  marks[1][0]=70; marks[1][1]=257;
  marks[2]=NULL;
  free(marks[0]); free(marks[1]); free(marks);
  return 0;
}`;

it("shows table slots and separately allocated rows, including missing values and rewind after free", () => {
  const r = run(code);
  expect(r.status,r.error?.reason).toBe("ok");
  const end = r.trace.steps.at(-1)!;
  const [table,row0,row1] = end.memory.allocations.map(a => a.address);
  const seekUnwritten = r.trace.steps.find(s => s.frames[0].variables?.marks?.heapIntRows && s.memory.allocations.length === 1)!;
  const seekBefore = r.trace.steps.find(s => s.memory.bytes[row1] === 70 && s.memory.shadows[row1+4] === "allocated-uninitialized")!;
  const seekFull = r.trace.steps.find(s => s.memory.shadows[table+11] === "initialized")!;
  const seekFree = r.trace.steps.find(s => s.memory.allocations[1]?.freeStep !== undefined)!;
  expect(seekFull.index).toBeGreaterThan(seekBefore.index);
  expect(seekFree.index).toBeGreaterThan(seekFull.index);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); localStorage.setItem("memlens-code", code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>("button.run")!.click());
    const seek = (i: number) => act(() => host.querySelector<HTMLButtonElement>(`[data-trace-index="${i}"]`)!.click());
    const diagram = () => host.querySelector('[aria-label="Heap matrix marks"]');
    const row = (i: number) => diagram()!.querySelector(`[data-matrix-row="${i}"]`)!;
    const cell = (i: number, j: number) => row(i).querySelector(`[data-matrix-col="${j}"]`)!;
    const hex = (n: number) => `0x${n.toString(16)}`;
    seek(seekFull.index);
    expect(diagram()).toBeNull();
    act(() => [...host.querySelectorAll("button")].find(b => b.textContent === "View marks as heap matrix")!.click());
    expect(row(0).textContent).toContain(hex(table));
    expect(row(1).textContent).toContain(hex(table + 4));
    expect(row(2).textContent).toContain("NULL");
    expect(cell(0,0).textContent).toBe(`[0]901${hex(row0)}`);
    expect(cell(0,1).textContent).toBe(`[1]-300${hex(row0+4)}`);
    expect(cell(1,1).textContent).toBe(`[1]257${hex(row1+4)}`);
    expect(cell(1,2).textContent).toBe(`[2]not recorded${hex(row1+8)}`);
    expect(row(0).querySelectorAll("[data-matrix-col]")).toHaveLength(2);
    seek(seekFree.index);
    expect(row(0).textContent).toContain("freed row");
    expect(row(0).querySelector("[data-matrix-col]")).toBeNull();
    seek(end.index);
    expect(diagram()?.textContent).toContain("was freed");
    seek(seekBefore.index);
    expect(cell(1,0).textContent).toContain("70");
    expect(cell(1,1).textContent).toContain("not recorded");
    seek(seekUnwritten.index);
    expect(row(0).textContent).toContain("not recorded");
    seek(0);
    expect(diagram()?.textContent).toContain("not in scope");
    seek(seekFull.index);
    expect(cell(1,1).textContent).toBe(`[1]257${hex(row1+4)}`);
    act(() => [...diagram()!.querySelectorAll("button")].find(b => b.textContent === "Close matrix view")!.click());
    expect(diagram()).toBeNull();
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});

it("does not offer a heap matrix for an ordinary int pointer or a local flat array", () => {
  const r=run(`int main(void){ int *p=malloc(16); int a[2][3]; printf("%d",sizeof a); free(p); }`);
  expect(r.status).toBe("ok");
  expect(r.trace.steps.some(s => Object.values(s.frames[0].variables ?? {}).some(v => v.heapIntRows))).toBe(false);
});
