import { expect, it } from "vitest";
import type { FrameVariable } from "../vm/trace";
import { readCircularQueue } from "./StructCircularQueueDiagram";

const field = (value: string): FrameVariable => ({ type: "int", value, pointer: false });
const vars = (front: string, rear: string, count: string): Record<string, FrameVariable> => ({
  "q.front": field(front), "q.rear": field(rear), "q.count": field(count),
  "q.items": { type: "int[1]", value: "1 cells", pointer: false, array: { base: 4, dimensions: [1], cells: [15] } },
});

it("distinguishes full and empty even in a single-slot ring", () => {
  const full = readCircularQueue(vars("0", "0", "1"), "q.items");
  const empty = readCircularQueue(vars("0", "0", "0"), "q.items");
  expect(full?.coherent && full.occupied(0)).toBe(true);
  expect(empty?.coherent && empty.occupied(0)).toBe(false);
});

it.each([["1", "0", "1"], ["0", "0", "-1"], ["0", "0", "2"], ["0", "0", "uninitialized"]])(
  "does not invent occupancy for invalid endpoints or count %s/%s/%s", (front, rear, count) => {
    const q = readCircularQueue(vars(front, rear, count), "q.items");
    expect(q?.coherent).toBe(false);
    expect(q?.occupied(0)).toBe(false);
  },
);

it("does not offer the count convention on a linear queue with no count field", () => {
  const v = vars("0", "0", "1");
  delete v["q.count"];
  expect(readCircularQueue(v, "q.items")).toBeUndefined();
});
