// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { samples } from "../samples";
import { starterScaffolds } from "../starterScaffolds";
import { run } from "../vm/interpreter";
import { readLabTraversal } from "../viz/graph";
import { App } from "./App";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

function render(code: string, inspect: (host: HTMLElement, seek: (index: number) => void) => void) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem("memlens-code", code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>("button.run")!.click());
    inspect(host, i => act(() => host.querySelectorAll<HTMLButtonElement>(".event-tick")[i].click()));
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
}

it("shows only waiting BFS vertices, then follows the real DFS call stack and rewind", () => {
  const code = samples["graph-traversal"].code;
  const result = run(code);
  expect(result.status, result.error?.reason).toBe("ok");
  const steps = result.trace.steps;
  expect(steps.at(-1)?.stdout).toBe("BFS: 0 1 2 3 4\nDFS: 0 1 2 4 3\n");
  const states = steps.map(step => readLabTraversal(step, 5));
  const bfs = states.findIndex(s => s?.kind === "BFS" && s.active === 1 && s.pending.join() === "2");
  expect(steps[bfs]?.frames.find(f => f.name === "bfs")?.variables?.q?.array?.cells.slice(0, 3)).toEqual([0, 1, 2]);
  const bfsLater = states.findIndex((s, i) => i > bfs && s?.kind === "BFS" && s.active === 1 && s.pending.join() === "2,3");
  const deep = states.findIndex(s => s?.kind === "DFS" && s.pending.join() === "0,1,2,4" && s.discovered.includes(4));
  const back1 = states.findIndex((s, i) => i > deep && s?.kind === "DFS" && s.pending.join() === "0,1,2");
  const back2 = states.findIndex((s, i) => i > back1 && s?.kind === "DFS" && s.pending.join() === "0,1");
  const next = states.findIndex((s, i) => i > back2 && s?.kind === "DFS" && s.pending.join() === "0,1,3");
  expect(bfs).toBeGreaterThanOrEqual(0);
  expect(bfsLater).toBeGreaterThan(bfs);
  expect(deep).toBeGreaterThan(bfsLater);
  expect(back1).toBeGreaterThan(deep);
  expect(back2).toBeGreaterThan(back1);
  expect(next).toBeGreaterThan(back2);

  render(code, (host, seek) => {
    const graph = () => host.querySelector('[aria-label="Adjacency graph"]')!;
    const phase = (vertex: number) => graph().querySelector(`[data-vertex="${vertex}"]`)?.getAttribute("data-phase");
    const state = () => [...graph().querySelectorAll("dd")].map(n => n.textContent);
    seek(bfs);
    expect(graph().querySelectorAll("[data-edge]")).toHaveLength(5);
    expect(state()).toEqual(["1", "2", "0, 1, 2"]);
    expect([phase(0), phase(1), phase(2)]).toEqual(["discovered", "active", "queued"]);
    seek(bfsLater);
    expect(state()).toEqual(["1", "2 → 3", "0, 1, 2, 3"]);
    seek(deep);
    expect(state()).toEqual(["4", "0 → 1 → 2 → 4", "0, 1, 2, 4"]);
    seek(back1);
    expect(state()).toEqual(["2", "0 → 1 → 2", "0, 1, 2, 4"]);
    seek(back2);
    expect(state()).toEqual(["1", "0 → 1", "0, 1, 2, 4"]);
    seek(next);
    expect(state()).toEqual(["3", "0 → 1 → 3", "0, 1, 2, 4"]);
    seek(deep);
    expect(state()).toEqual(["4", "0 → 1 → 2 → 4", "0, 1, 2, 4"]);
  });
});

it("keeps an ordinary pasted matrix as a matrix until selected, then shows a directed edge and isolated vertex", () => {
  const code = "int main(void) { int a[3][3] = {0}; a[0][1] = 1; return 0; }";
  const steps = run(code).trace.steps;
  const changed = steps.findIndex(s => s.frames[0]?.variables?.a?.array?.cells[1] === 1);
  expect(changed).toBeGreaterThan(0);
  render(code, (host, seek) => {
    seek(changed);
    const graph = () => host.querySelector('[aria-label="Adjacency graph"]');
    const button = (name: string) => [...host.querySelectorAll("button")].find(b => b.textContent === name)!;
    expect(host.querySelector('table[aria-label="a[row][column]"]')).not.toBeNull();
    expect(graph()).toBeNull();
    act(() => button("View a as graph").click());
    expect(graph()?.querySelectorAll("[data-vertex]")).toHaveLength(3);
    expect(graph()?.querySelector('[data-vertex="2"]')).not.toBeNull();
    expect(graph()?.querySelector('[data-edge="0,1"] path')?.getAttribute("marker-end")).toMatch(/^url\(#/);
    expect(graph()?.querySelectorAll("[data-edge]")).toHaveLength(1);
    expect(graph()?.querySelector("dl")).toBeNull();
    seek(changed - 1);
    expect(graph()?.querySelectorAll("[data-edge]")).toHaveLength(0);
    seek(changed);
    expect(graph()?.querySelectorAll("[data-edge]")).toHaveLength(1);
    act(() => button("Close graph").click());
    expect(graph()).toBeNull();
    expect(host.querySelector('table[aria-label="a[row][column]"]')).not.toBeNull();
  });
});

it("opens the editable Graph starter and rewinds the two matrix writes of an undirected edge", () => {
  const { code, output } = starterScaffolds.graph;
  const result = run(code);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.view?.stdout).toBe(output);
  const steps = result.trace.steps;
  const cells = (i: number) => steps[i].frames[0]?.variables?.graph?.array?.cells;
  const empty = steps.findIndex((_, i) => cells(i)?.every(value => value === 0));
  const first = steps.findIndex((_, i) => cells(i)?.[1] === 1 && cells(i)?.[4] === 0);
  const mirrored = steps.findIndex((_, i) => cells(i)?.[1] === 1 && cells(i)?.[4] === 1);
  expect(empty).toBeGreaterThanOrEqual(0);
  expect(first).toBeGreaterThan(empty);
  expect(mirrored).toBeGreaterThan(first);

  render(code, (host, seek) => {
    seek(empty);
    expect(host.querySelector('table[aria-label="graph[row][column]"]')).not.toBeNull();
    expect(host.querySelector(".graph-diagram")).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>(".graph-trigger")!.click());
    const edges = () => [...host.querySelectorAll(".graph-diagram [data-edge]")].map(edge => edge.getAttribute("data-edge"));
    const directed = () => host.querySelector(".graph-caption")?.textContent;
    act(() => host.querySelector<HTMLInputElement>('.graph-diagram input[type="checkbox"]')!.click());
    expect(host.querySelectorAll(".graph-diagram [data-vertex]")).toHaveLength(4);
    expect(edges()).toEqual([]);
    seek(first);
    expect(directed()).toContain("Directed · matrix is asymmetric");
    expect(edges()).toEqual(["0,1"]);
    seek(mirrored);
    expect(directed()).toContain("Undirected");
    expect(edges()).toEqual(["0,1"]);
    seek(steps.length - 1);
    expect(edges()).toEqual(["0,1", "0,2", "2,3"]);
    seek(empty);
    expect(edges()).toEqual([]);
  });
});
