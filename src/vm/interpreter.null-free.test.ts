import { expect, it } from "vitest";
import { run } from "./interpreter";
import { Memory } from "./memory";
it('allows repeated free of a null pointer during empty-list cleanup', () => {
 const r=run('int main(){ int *head=NULL; free(head); free(NULL); printf("empty"); }');
 expect(r.status).toBe('ok'); expect(r.trace.steps.at(-1)?.stdout).toBe('empty'); expect(r.leaks).toHaveLength(0);
 expect(r.trace.steps.filter(step => step.event === 'free')).toHaveLength(0);
});
it('leaves existing allocations unchanged when freeing NULL', () => {
 const m=new Memory(); const p=m.malloc(4,0,1); m.write(p,7,1,2); const before=m.snapshot();
 m.free(0,2,3); m.free(0,3,4); expect(m.snapshot()).toEqual(before); expect(m.read(p,4,5)).toBe(7);
});
it('still diagnoses double free and invalid nonnull free', () => {
 const m=new Memory(); const p=m.malloc(4,0,1); m.free(p,1,2);
 expect(()=>m.free(p,2,3)).toThrow('double free'); expect(()=>m.free(123,2,3)).toThrow('invalid free');
});
it('allows cleanup after a pointer is freed and explicitly reset to NULL', () => {
 const r=run('int main(){ int *p=malloc(sizeof(int)); *p=42; free(p); p=NULL; free(p); printf("clean"); }');
 expect(r.status).toBe('ok'); expect(r.trace.steps.at(-1)?.stdout).toBe('clean'); expect(r.leaks).toHaveLength(0);
 expect(r.trace.steps.filter(step => step.event === 'free')).toHaveLength(1);
});
