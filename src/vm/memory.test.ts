import { describe, expect, it } from "vitest";
import { Memory, MemoryFault } from "./memory";

describe("simulated memory", () => {
  it("tracks allocation, initialization, and use-after-free", () => {
    const memory = new Memory(); const address = memory.malloc(4, 0, 2);
    expect(() => memory.read(address, 1, 3)).toThrow("uninitialized read");
    memory.write(address, 7, 2, 4); expect(memory.read(address, 3, 5)).toBe(7);
    memory.free(address, 4, 6);
    expect(() => memory.read(address, 5, 7)).toThrow("use-after-free");
    expect(() => memory.free(address, 6, 8)).toThrow("double free");
  });
  it("rejects null dereference", () => {
    const memory = new Memory();
    expect(() => memory.write(0, 1, 0, 9)).toThrow(MemoryFault);
  });
});

it('preserves allocation failure metadata and leaves allocation state unchanged', () => {
  const memory = new Memory();
  let fault: unknown;
  try { memory.malloc(40000, 17, 29); } catch (error) { fault = error; }
  expect(fault).toBeInstanceOf(MemoryFault);
  expect((fault as MemoryFault).line).toBe(29);
  expect((fault as MemoryFault).step).toBe(17);
  expect(memory.allocations).toHaveLength(0);
  expect(memory.malloc(4, 18, 30)).toBe(0x1000);
});
