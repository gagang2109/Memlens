import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
import { practiceSource } from '../ui/practiceHarness';
describe('duplicate function definitions', () => {
  it('rejects a second definition rather than silently replacing the first', () => {
    const result = run('int height(){return 1;}\nint height(){return 9;}\nint main(){printf("%d",height());}');
    expect(result.status).toBe('error');
    expect(result.error?.reason).toContain("duplicate definition of function 'height'");
    expect(result.error?.line).toBe(2);
    expect(result.trace.steps.at(-1)?.stdout).toBe('');
  });
  it('reports duplicate helpers appended in practice setup', () => {
    const prepared = practiceSource('int height(){return 1;}', 'int height(){return 2;}\nprintf("%d",height());');
    const result = run(prepared.source);
    expect(result.status).toBe('error');
    expect(prepared.location(result.error!.line)).toBe('test setup line 1');
  });
});
it('allows prototypes before and after a single definition', () => {
  const result = run('int f(int n);int f(int n);int f(int n){return n+1;}int f(int n);int main(){printf("%d",f(4));}');
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('5');
});
it('rejects duplicate main definitions', () => {
  const result = run('int main(){printf("first");}\nint main(){printf("second");}');
  expect(result.status).toBe('error');
  expect(result.error?.line).toBe(2);
  expect(result.error?.reason).toContain("duplicate definition of function 'main'");
});
it('does not mistake recursive calls for duplicate definitions', () => {
  const result = run('int f(int n){if(n==0)return 0;return 1+f(n-1);}int main(){printf("%d",f(3));}');
  expect(result.status).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('3');
});
