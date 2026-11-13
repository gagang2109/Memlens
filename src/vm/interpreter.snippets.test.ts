import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
import { samples } from '../samples';
describe('existing main-less snippet execution',()=>{
  it('runs top-level statements without hidden wrapper lines',()=>{
    const r=run('int x=5;\nx+=2;\nprintf("%d",x);');
    expect(r.executionMode).toBe('snippet'); expect(r.status).toBe('ok');
    expect(r.trace.view?.stdout).toBe('7'); expect(r.trace.steps.map(s=>s.line)).toEqual([1,2,3]);
  });
  it('only runs a helper when explicitly called with supplied arguments',()=>{
    const definition='int square(int x){return x*x;}';
    expect(run(definition).trace.steps).toHaveLength(0);
    expect(run(definition+'\nprintf("%d",square(4));').trace.view?.stdout).toBe('16');
  });
  it('does not invent missing data or shift error lines',()=>{
    const r=run('// snippet\nint x=1;\nprintf("%d",missing);');
    expect(r.status).toBe('error');expect(r.error?.line).toBe(3);expect(r.error?.reason).toContain('unknown variable');
  });
  it('keeps full program execution and mixed top-level order unchanged',()=>{
    const r=run('printf("before"); int main(){printf("main");}');
    expect(r.executionMode).toBe('program');expect(r.trace.view?.stdout).toBe('beforemain');
  });
  it('runs the no-main sample',()=>{
    const r=run(samples.snippet.code);expect(r.status).toBe('ok');expect(r.executionMode).toBe('snippet');expect(r.trace.view?.stdout).toBe('Sum: 13\n');
  });
});
