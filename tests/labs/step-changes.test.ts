import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { run } from "../../src/vm/interpreter";
import { stepChanges } from "../../src/ui/stepChanges";

it("shows exactly the caller-owned cells written through a matrix alias, including on rewind", () => {
  const source = readFileSync(new URL("./12_graph_traversals.c", import.meta.url), "utf8");
  const result = run(source, 100000, 100, "0");
  expect(result.status, result.error?.reason).toBe("ok");
  const trace = result.trace;
  const frame = (i: number) => trace.steps[i].frames[0];
  const first = trace.steps.findIndex(step => step.frames[0].variables?.g?.array?.cells[1] === 1);
  expect(first).toBeGreaterThan(0);
  expect(frame(first).variables!.g.array?.dimensions).toEqual([5,5]);
  expect(stepChanges(trace.steps[first-1], trace.steps[first]).frames.get(0)?.get("g"))
    .toEqual({cells:new Map([[1,{before:"0",after:"1"}]])});
  expect(stepChanges(trace.steps[first], trace.steps[first+1]).frames.get(0)?.get("g"))
    .toEqual({cells:new Map([[5,{before:"0",after:"1"}]])});
  expect(trace.goto(first)?.frames[0].variables?.g.array?.cells[5]).toBe(0);
  expect(trace.goto(first-1)?.frames[0].variables?.g.array?.cells[1]).toBe(0);

  const call = trace.steps.findIndex(step => {
    const dfs = step.frames.filter(frame => frame.name === "dfs");
    return step.event === "call" && dfs.length === 2 && dfs[0].variables?.v.value === "0" && dfs[1].variables?.v.value === "1";
  });
  expect(call).toBeGreaterThan(first);
  const parent = trace.steps[call].frames.at(-2)!;
  expect(parent.invocation).toBe(trace.steps[call-1].frames.at(-1)?.invocation);
  expect(parent.invocation).not.toBe(trace.steps[call].frames.at(-1)?.invocation);
  const entry = stepChanges(trace.steps[call-1], trace.steps[call]);
  expect(entry.frames.get(parent.invocation!)?.has("v")).not.toBe(true);
  expect(entry.frames.has(trace.steps[call].frames.at(-1)!.invocation!)).toBe(false);
  expect(trace.steps[call].frames.at(-2)?.variables?.v.value).toBe("0");
  expect(stepChanges(trace.steps[call], trace.steps[call+1]).frames.get(0)?.get("seen"))
    .toEqual({cells:new Map([[1,{before:"0",after:"1"}]])});
  expect(trace.goto(call)?.frames[0].variables?.seen.array?.cells[1]).toBe(0);

  const sameArray = trace.steps.findIndex(step => step.event === "call" && step.frames.at(-1)?.name === "edge");
  expect(frame(sameArray).variables?.g.array).toBe(frame(sameArray-1).variables?.g.array);
});
