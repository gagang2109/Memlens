import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
describe('user-defined function argument counts', () => {
  it.each(['sum(3)', 'sum(3,4,5)'])('rejects %s instead of fabricating or dropping arguments', call => {
    const result = run(`int sum(int a,int b){return a+b;}\nint main(){printf("%d",${call});}`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toContain("function 'sum' expects 2 arguments");
    expect(result.error?.line).toBe(2);
  });
});
it('preserves correct calls and recursion', () => {
  const result = run('int fact(int n){if(n<2)return 1;return n*fact(n-1);}int main(){printf("%d",fact(5));}');
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('120');
});
it('rejects arguments to a void-parameter helper', () => {
  const result = run('int answer(void){return 42;}int main(){answer(1);}');
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain("function 'answer' expects 0 arguments, received 1");
});
it('keeps zero-argument calls working', () => {
  const result = run('int answer(void){return 42;}int main(){printf("%d",answer());}');
  expect(result.status).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('42');
});
it('does not evaluate invalid-call arguments or enter the function', () => {
  const result = run('int f(int a){printf("entered");return a;}int main(){f(printf("argument"),2);}');
  expect(result.status).toBe('error');
  expect(result.trace.steps.at(-1)?.stdout).toBe('');
  expect(result.trace.steps.some(step => step.frames.some(frame => frame.name === 'f'))).toBe(false);
});
it('preserves variadic builtins and extra printf argument evaluation', () => {
  const result = run('int main(){int n=0;printf("%d %d",1,2,n++);printf(" %d",n);}');
  expect(result.status).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('1 2 1');
});
