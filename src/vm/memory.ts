export type Shadow = "unallocated" | "allocated-uninitialized" | "initialized" | "freed";
export type Allocation = { address: number; size: number; allocStep: number; freeStep?: number; line: number; label?: string; type?: string; elementSize?: number; elementType?: string };
export type MemorySnapshot = { bytes: readonly number[]; shadows: readonly Shadow[]; allocations: Allocation[] };

export class Memory {
  private readonly bytes = new Uint8Array(65536);
  private readonly shadows: Shadow[] = Array(65536).fill("unallocated");
  readonly allocations: Allocation[] = [];
  private next = 0x1000;
  private snapshotData?: Pick<MemorySnapshot, "bytes" | "shadows">;
  malloc(size: number, step: number, line: number, label?: string): number {
    if (size <= 0 || this.next + size >= 0x8000) throw new Error("out of simulated memory");
    this.snapshotData = undefined;
    const address = this.next; this.next += size;
    for (let i = address; i < address + size; i++) this.shadows[i] = "allocated-uninitialized";
    this.allocations.push({ address, size, allocStep: step, line, label }); return address;
  }
  allocationAt(address: number) { return this.allocations.find(a => address >= a.address && address < a.address + a.size); }
  find(address: number, size = 1) { return this.allocations.find(a => address >= a.address && address + size <= a.address + a.size); }
  read(address: number, step: number, line: number): number {
    const a = this.find(address); if (!a) throw new MemoryFault("invalid pointer dereference", line, step);
    if (a.freeStep !== undefined) throw new MemoryFault("use-after-free", line, step, a);
    if (this.shadows[address] !== "initialized") throw new MemoryFault("uninitialized read", line, step, a, false);
    return this.bytes[address];
  }
  write(address: number, value: number, step: number, line: number) {
    const a = this.find(address); if (!a) throw new MemoryFault("invalid pointer dereference", line, step);
    if (a.freeStep !== undefined) throw new MemoryFault("use-after-free", line, step, a);
    this.snapshotData = undefined;
    this.bytes[address] = value & 255; this.shadows[address] = "initialized";
  }
  copyAllocationState(source: number, destination: number, size: number, step: number, line: number) {
    for (const address of [source, destination]) {
      const allocation = this.find(address, size);
      if (!allocation) throw new MemoryFault("invalid pointer dereference", line, step);
      if (allocation.freeStep !== undefined) throw new MemoryFault("use-after-free", line, step, allocation);
    }
    // Reallocation preserves indeterminate bytes without reading their values.
    // Copy shadow state too, rather than treating every old byte as initialized.
    this.snapshotData = undefined;
    this.bytes.copyWithin(destination, source, source + size);
    const shadows = this.shadows.slice(source, source + size);
    for (let i = 0; i < size; i++) this.shadows[destination + i] = shadows[i];
  }
  free(address: number, step: number, line: number) {
    // C defines free(NULL) as a no-op, including repeated cleanup calls.
    if (address === 0) return;
    const a = this.allocations.find(x => x.address === address);
    if (!a) throw new MemoryFault("invalid free", line, step);
    if (a.freeStep !== undefined) throw new MemoryFault("double free", line, step, a);
    this.snapshotData = undefined;
    a.freeStep = step; for (let i = a.address; i < a.address + a.size; i++) this.shadows[i] = "freed";
  }
  snapshot(): MemorySnapshot {
    // Trace events often change only locals. Share immutable memory arrays until
    // a memory operation changes them, while copying mutable allocation metadata.
    this.snapshotData ??= {
      bytes: Object.freeze(Array.from(this.bytes)),
      shadows: Object.freeze([...this.shadows]),
    };
    return { ...this.snapshotData, allocations: this.allocations.map(a => ({ ...a })) };
  }
  restore(s: MemorySnapshot) { this.snapshotData = undefined; this.bytes.set(s.bytes); this.shadows.splice(0, this.shadows.length, ...s.shadows); this.allocations.splice(0, this.allocations.length, ...s.allocations.map(a => ({ ...a }))); this.next = Math.max(0x1000, ...this.allocations.map(a => a.address + a.size)); }
  orphaned(rootAddresses: number[]): Allocation[] {
    return this.allocations.filter(a => a.freeStep === undefined && !rootAddresses.some(root => this.find(root) === a));
  }
}
export class MemoryFault extends Error { constructor(public readonly reason: string, public readonly line: number, public readonly step: number, public readonly allocation?: Allocation, public readonly fatal = true) { super(reason); } }
