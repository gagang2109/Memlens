import { expect, it } from "vitest";
import type { TraceStep } from "../vm/trace";
import { adjacentEvents, markerLimit, traceMarkers } from "./traceMarkers";

it("preserves real event indexes even when equally distributed event markers are thinned", () => {
  const steps = Array.from({ length: 1000 }, (_, index): TraceStep => ({
    index, line: 1, stdout: "", frames: [], memory: { bytes: [], shadows: [], allocations: [] },
    event: index === 999 ? "error" : index % 2 ? "alloc" : "step",
  }));
  const { indexes, events } = traceMarkers(steps);
  expect(indexes.length).toBeLessThanOrEqual(markerLimit);
  expect(indexes[0]).toBe(0);
  expect(indexes.at(-1)).toBe(999);
  expect(events).toHaveLength(500);
  const omitted = events.find(index => !indexes.includes(index))!;
  expect(adjacentEvents(events, omitted - 1).next).toBe(omitted);
  expect(adjacentEvents(events, omitted + 1).previous).toBe(omitted);
  expect(adjacentEvents(events, 0).previous).toBeUndefined();
  expect(adjacentEvents(events, 999).next).toBeUndefined();
});
