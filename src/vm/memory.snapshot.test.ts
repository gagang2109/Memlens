import { describe, expect, it } from "vitest";
import { Memory } from "./memory";
import { run } from "./interpreter";

describe("immutable shared trace memory", () => {
  it("shares unchanged arrays but not mutable allocation metadata", () => {
    const memory = new Memory();
    const address = memory.malloc(4, 0, 1);
    const before = memory.snapshot();
    memory.find(address)!.type = "int";
    const after = memory.snapshot();
    expect(after.bytes).toBe(before.bytes);
    expect(after.shadows).toBe(before.shadows);
    expect(before.allocations[0].type).toBeUndefined();
    expect(after.allocations[0].type).toBe("int");
    expect(Object.isFrozen(before.bytes)).toBe(true);
    expect(Object.isFrozen(before.shadows)).toBe(true);
  });
  it("preserves history across allocation, write, free, and restore", () => {
    const memory = new Memory();
    const empty = memory.snapshot();
    const address = memory.malloc(4, 0, 1);
    const allocated = memory.snapshot();
    memory.write(address, 42, 1, 2);
    const written = memory.snapshot();
    memory.free(address, 2, 3);
    const freed = memory.snapshot();
    expect(empty.shadows[address]).toBe("unallocated");
    expect(allocated.shadows[address]).toBe("allocated-uninitialized");
    expect(allocated.bytes[address]).toBe(0);
    expect(written.bytes[address]).toBe(42);
    expect(written.shadows[address]).toBe("initialized");
    expect(written.allocations[0].freeStep).toBeUndefined();
    expect(freed.shadows[address]).toBe("freed");
    expect(written.bytes).not.toBe(allocated.bytes);
    expect(freed.shadows).not.toBe(written.shadows);
    memory.restore(allocated);
    expect(memory.snapshot()).toEqual(allocated);
    memory.write(address, 9, 3, 4);
    expect(memory.snapshot().bytes[address]).toBe(9);
    expect(written.bytes[address]).toBe(42);
    memory.restore(empty);
    expect(memory.snapshot()).toEqual(empty);
    expect(memory.malloc(4, 4, 5)).toBe(address);
  });
  it("retains distinct local states while sharing unchanged byte arrays", () => {
    const result = run('int main(){int x=0;while(x<3){x++;}printf("%d",x);}', 50);
    expect(result.status).toBe("ok");
    const steps = result.trace.steps;
    expect(new Set(steps.map(step => step.memory.bytes)).size).toBe(1);
    expect(new Set(steps.map(step => step.memory.shadows)).size).toBe(1);
    expect(steps[1].frames[0].locals.x).toBe("0");
    expect(steps.at(-1)?.frames[0].locals.x).toBe("3");
  });
});
