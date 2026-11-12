import { describe, expect, it } from "vitest";
import { run } from "./interpreter";
describe("realloc initialization state", () => {
 it("does not invent zero values for untouched dynamic-array slots", () => {
  const r=run('int main(){ int *a=malloc(2*sizeof(int)); a[0]=17; a=realloc(a,4*sizeof(int)); printf("%d",a[1]); }');
  expect(r.status).toBe("error"); expect(r.error?.reason).toBe("uninitialized read");
 });
 it("preserves initialized bytes in the memory canvas", () => {
  const r=run('int main(){ char *a=malloc(2); a[0]=65; a=realloc(a,4); printf("%c",a[0]); }');
  expect(r.status).toBe("ok"); expect(r.trace.steps.at(-1)?.stdout).toBe("A");
  const memory=r.trace.steps.at(-1)!.memory; const live=memory.allocations.find(a=>a.freeStep===undefined)!;
  expect(memory.bytes[live.address]).toBe(65); expect(memory.shadows[live.address]).toBe("initialized");
  expect(memory.shadows[live.address+1]).toBe("allocated-uninitialized");
 });
});
it("preserves calloc zeros while leaving a grown tail uninitialized", () => {
 const r=run('int main(){ int *a=calloc(2,sizeof(int)); a=realloc(a,3*sizeof(int)); printf("%d %d",a[0],a[1]); printf("%d",a[2]); }');
 expect(r.status).toBe("error"); expect(r.error?.reason).toBe("uninitialized read");
 expect(r.trace.steps.at(-1)?.stdout).toBe("0 0");
});
it("preserves initialized full-width values when shrinking", () => {
 const r=run('int main(){ int *a=malloc(3*sizeof(int)); a[0]=1000; a[1]=-27; a=realloc(a,2*sizeof(int)); printf("%d %d",a[0],a[1]); free(a); }');
 expect(r.status).toBe("ok"); expect(r.trace.steps.at(-1)?.stdout).toBe("1000 -27"); expect(r.leaks).toHaveLength(0);
});
it("preserves previous snapshots and invalidates old pointer aliases", () => {
 const r=run('int main(){ char *a=malloc(2); a[0]=65; char *old=a; a=realloc(a,4); printf("%c",old[0]); }');
 expect(r.status).toBe("error"); expect(r.error?.reason).toBe("use-after-free");
 const prior=r.trace.steps.find(step=>step.memory.allocations.length===1 && step.memory.bytes[0x1000]===65)!;
 expect(prior.memory.shadows[0x1000]).toBe("initialized");
 expect(prior.memory.allocations[0].freeStep).toBeUndefined();
 expect(r.trace.steps.at(-1)!.memory.shadows[0x1000]).toBe("freed");
});
it("treats realloc(NULL,size) as a fresh uninitialized allocation", () => {
 const r=run('int main(){ int *a=realloc(NULL,sizeof(int)); printf("%d",a[0]); }');
 expect(r.status).toBe("error"); expect(r.error?.reason).toBe("uninitialized read");
});
it.each(["0", "65536"])("preserves the old allocation on simulated realloc rejection for size %s", size => {
 const r=run(`int main(){ char *a=malloc(2); a[0]=65; a=realloc(a,${size}); }`);
 expect(r.status).toBe("error"); expect(r.error?.reason).toContain("out of simulated memory");
 const memory=r.trace.steps.at(-1)!.memory;
 expect(memory.allocations).toHaveLength(1); expect(memory.allocations[0].freeStep).toBeUndefined(); expect(memory.bytes[0x1000]).toBe(65);
});
it("keeps writes and reads in the grown tail functional", () => {
 const r=run('int main(){ int *a=malloc(sizeof(int)); a[0]=8; a=realloc(a,3*sizeof(int)); a[2]=24; printf("%d %d",a[0],a[2]); free(a); }');
 expect(r.status).toBe("ok"); expect(r.trace.steps.at(-1)?.stdout).toBe("8 24");
});
