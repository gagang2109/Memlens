import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
describe('fault-time call stack',()=>{
  it('keeps the failing helper and its locals visible at a memory error',()=>{
    const result=run('int helper(){int local=42;int *p=NULL;return *p;}int main(){helper();}');
    expect(result.status).toBe('error');
    const fault=result.trace.steps.at(-1)!;
    expect(fault.event).toBe('error');
    expect(fault.frames.map(frame=>frame.name)).toEqual(['main','helper']);
    expect(fault.frames.at(-1)?.locals.local).toBe('42');
    expect(result.trace.steps.some(step=>step.event==='return')).toBe(false);
  });
  it('retains all active nested callers when an inner function faults',()=>{
    const result=run('int inner(){int divisor=0;return 3/divisor;}int outer(){int marker=7;return inner();}int main(){outer();}');
    expect(result.error?.reason).toBe('division by zero');
    const frames=result.trace.steps.at(-1)!.frames;
    expect(frames.map(frame=>frame.name)).toEqual(['main','outer','inner']);
    expect(frames[1].locals.marker).toBe('7');
    expect(frames[2].locals.divisor).toBe('0');
  });
  it('still removes helper frames on successful return',()=>{
    const result=run('int helper(){int local=42;return local;}int main(){printf("%d",helper());}');
    expect(result.status).toBe('ok');
    expect(result.trace.steps.at(-1)!.frames.map(frame=>frame.name)).toEqual(['main']);
    expect(result.trace.steps.at(-1)?.stdout).toBe('42');
    expect(result.trace.steps.some(step=>step.event==='return')).toBe(true);
  });
  it('preserves successful exit behavior inside a helper',()=>{
    const result=run('int helper(){printf("bye");exit(0);return 9;}int main(){helper();printf("bad");}');
    expect(result.status).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('bye');
  });
});
