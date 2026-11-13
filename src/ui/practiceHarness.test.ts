import { describe, expect, it } from 'vitest';
import { practiceSource, validatePracticeSource, treeHeightCode, treeHeightSetup } from './practiceHarness';
import { run } from '../vm/interpreter';

describe('explicit practice harness', () => {
  it('keeps blank setup byte-for-byte unchanged', () => {
    const code='int main(){printf("ok");}';
    expect(practiceSource(code,' \n').source).toBe(code);
    expect(()=>validatePracticeSource(code,false)).not.toThrow();
  });
  it('runs compatible tree height with explicit inputs without main', () => {
    const r=run(practiceSource(treeHeightCode,treeHeightSetup).source);
    expect(r.status).toBe('ok'); expect(r.trace.view?.stdout).toBe('Height: 2'); expect(r.leaks).toEqual([]);
    expect(r.trace.steps.some(s=>s.frames.some(f=>f.name==='height'))).toBe(true);
  });
  it('preserves source lines and maps setup lines including CRLF', () => {
    const p=practiceSource('int f(){\r\n return 1;\r\n}', 'int x=1;\nprintf("%d",f());');
    expect(p.location(2)).toBe('source line 2'); expect(p.location(4)).toBe('test setup line 1');
    expect(p.diagnostic('parse error: line 5: broken')).toBe('parse error: test setup line 2: broken');
  });
  it('attributes setup parse errors and function runtime errors to correct areas', () => {
    const p=practiceSource('int f(){\n int *p=NULL;\n return *p;\n}', 'printf("%d",f());');
    const r=run(p.source); expect(r.error?.line).toBe(3); expect(p.location(r.error!.line)).toBe('source line 3');
    const q=practiceSource('int f(){return 1;}', 'int x=;'); const e=run(q.source).error!;
    expect(q.location(e.line)).toBe('test setup line 1');
  });
  it('does not guess missing arguments or definitions', () => {
    const r=run(practiceSource('int f(int n){return n;}', 'printf("%d",f(missing));').source);
    expect(r.status).toBe('error');
  });
  it('rejects active setup with main rather than executing both', () => {
    expect(()=>validatePracticeSource('int main(){return 0;}\nint x=1;', true)).toThrow('Clear test setup');
  });
});
