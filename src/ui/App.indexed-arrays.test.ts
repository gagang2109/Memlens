// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { run } from "../vm/interpreter";
import { App } from "./App";
import { stepChanges } from "./stepChanges";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear(); });

function render(code: string, input: string, inspect: (host: HTMLDivElement, seek: (step: number) => void) => void) {
  localStorage.setItem("memlens-code", code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(App)));
    if (input) act(() => {
      const field = host.querySelector<HTMLInputElement>('[aria-label="Standard input"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, input);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => host.querySelector<HTMLButtonElement>("button.run")!.click());
    inspect(host, i => act(() => host.querySelectorAll<HTMLButtonElement>(".event-tick")[i].click()));
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
}

function changeStep(code: string, name: string, input = "") {
  const result = run(code, undefined, undefined, input);
  expect(result.status, result.error?.reason).toBe("ok");
  const steps = result.trace.steps;
  const index = steps.findIndex((_, i) => stepChanges(steps[i - 1], steps[i]).frames.get(0)?.has(name));
  expect(index).toBeGreaterThan(0);
  return index;
}

const vla = `int main(void) {
  int rows, cols;
  scanf("%d %d", &rows, &cols);
  int a[rows][cols];
  int r = rows - 1, c = cols - 1;
  rows = 1;
  cols = 1;
  a[r][c] = 9;
  printf("%d", a[r][c]);
  return 0;
}`;

it.each([[2, 3], [3, 2]])("shows zero-based headers for a %i × %i matrix, and restores its cell on rewind", (rows, cols) => {
  const input = `${rows} ${cols}`;
  const step = changeStep(vla, "a", input);
  render(vla, input, (host, seek) => {
    seek(step);
    const table = host.querySelector<HTMLTableElement>('table[aria-label="a[row][column]"]')!;
    expect([...table.querySelectorAll('tbody th[scope="row"]')].map(th => th.textContent)).toEqual(Array.from({length: rows}, (_,i) => String(i)));
    expect([...table.querySelectorAll('thead th[scope="col"]')].map(th => th.textContent)).toEqual(["row / col", ...Array.from({length: cols}, (_,i) => String(i))]);
    const index = `[${rows - 1}][${cols - 1}]`;
    const changed = () => table.querySelector(`[data-cell="${index}"]`)!;
    expect(table.querySelectorAll("tbody td")).toHaveLength(rows * cols);
    expect(changed().getAttribute("title")).toBe(`${index}: 0 → 9`);
    expect(changed().classList.contains("step-changed-cell")).toBe(true);
    // Native scrolling with the keyboard must not move the trace underneath the matrix.
    const slider = host.querySelector<HTMLInputElement>('input[aria-label="Timeline"]')!;
    act(() => table.parentElement!.dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowRight", bubbles:true, cancelable:true})));
    expect(slider.value).toBe(String(step));
    seek(step - 1);
    expect(changed().textContent).toBe("0");
    expect(changed().classList.contains("step-changed-cell")).toBe(false);
  });
});

it("bounds a legal 128 × 128 matrix and jumps to an off-page change without moving the trace", () => {
  const code = "int main(void) { int a[128][128]; a[127][127] = 42; return 0; }";
  const step = changeStep(code, "a");
  render(code, "", (host, seek) => {
    seek(step);
    const array = host.querySelector('[data-array="a"]')!;
    expect(array.textContent).toContain("128 rows × 128 columns");
    expect(array.querySelectorAll("td")).toHaveLength(144);
    const press = (label: string) => act(() => array.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
    press("Next columns");
    press("Next rows");
    expect(array.querySelector("td")?.getAttribute("data-cell")).toBe("[12][12]");
    act(() => [...array.querySelectorAll("button")].find(button => button.textContent?.startsWith("Show next changed page"))!.click());
    const target = array.querySelector('td[data-cell="[127][127]"]')!;
    expect(target.getAttribute("title")).toBe("[127][127]: 0 → 42");
    expect(array.querySelectorAll("td")).toHaveLength(64);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Timeline"]')!.value).toBe(String(step));
    seek(step - 1);
    expect(target.textContent).toBe("0");
    expect(target.classList.contains("step-changed-cell")).toBe(false);
  });
});

it("keeps long one-dimensional arrays in an indexed strip and shows the changed last cell", () => {
  const code = "int main(void) { int a[35]; a[34] = 8; return 0; }";
  render(code, "", (host, seek) => {
    seek(changeStep(code, "a"));
    const array = host.querySelector('[data-array="a"]')!;
    expect(array.querySelector("table")).toBeNull();
    expect(array.querySelectorAll(".array-cell")).toHaveLength(32);
    act(() => array.querySelector<HTMLButtonElement>('[aria-label="Next cells"]')!.click());
    expect([...array.querySelectorAll(".array-cell")].map(cell => cell.getAttribute("data-cell"))).toEqual(["[32]", "[33]", "[34]"]);
    expect(array.querySelector(".step-changed-cell")?.getAttribute("title")).toBe("[34]: 0 → 8");
  });
});

it("places a helper's write at the correct coordinates in the caller's matrix", () => {
  const code = `void edge(int g[][3]) { g[1][2] = 1; }
int main(void) { int graph[2][3] = {0}; edge(graph); return 0; }`;
  render(code, "", (host, seek) => {
    seek(changeStep(code, "graph"));
    expect(host.querySelector('[data-array="graph"] .step-changed-cell')?.getAttribute("title")).toBe("[1][2]: 0 → 1");
    expect(host.querySelector('[data-array="g"]')).toBeNull();
  });
});
