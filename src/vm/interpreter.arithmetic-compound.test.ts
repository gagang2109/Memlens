import { describe, expect, it } from 'vitest';
import { run } from './interpreter';

describe('arithmetic compound assignments', () => {
  it('supports multiplication, division and remainder assignment', () => {
    const result = run('int main(){int x=7;x*=3;x/=2;x%=4;printf("%d",x);}');
    expect(result.status, result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('2');
  });
  it('evaluates the left reference once', () => {
    const result = run('int main(){int a[2]={9,8};int i=0;a[i++]/=2;printf("%d %d %d",a[0],a[1],i);}');
    expect(result.status, result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('4 8 1');
  });
});

it('preserves signed integer arithmetic and chained assignment values', () => {
  const result = run('int main(){int a=3;int b=8;int c=(a*=b/=3);int d=-7;d/=2;int e=-7;e%=3;printf("%d %d %d %d %d",a,b,c,d,e);}');
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('6 2 6 -3 -1');
});
it.each([['/=', 'division'], ['%=', 'remainder']])('rejects zero in %s before updating target', (op, message) => {
  const result = run(`int main(){\nint x=7;\nx${op}0;\nprintf("continued");}`);
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain(`${message} by zero`);
  expect(result.error?.line).toBe(3);
  expect(result.trace.steps.at(-1)?.stdout).not.toContain('continued');
});
it.each(['*=', '/=', '%='])('rejects invalid pointer %s', op => {
  const result = run(`int main(){int a[2];int *p=a;p${op}2;}`);
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('invalid arithmetic compound assignment to pointer');
});
it('updates an indexed heap value once', () => {
  const result = run('int main(){int *p=malloc(8);p[0]=5;p[1]=9;int i=0;p[i++]*=3;printf("%d %d %d",p[0],p[1],i);free(p);}');
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('15 9 1');
});
it('does not execute a short-circuited assignment', () => {
  const result = run('int main(){int x=7;int y=0&&(x/=0);printf("%d %d",x,y);}');
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('7 0');
});
it.each(['float', 'double'])('rejects unsupported %s compound arithmetic instead of truncating', type => {
  const result = run(`int main(){${type} x=7;x/=2;printf("%.1f",x);}`);
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('requires a supported integer target');
});
it.each(['*=', '/=', '%='])('rejects fractional operand for %s instead of storing wrong value', op => {
  const result = run(`int main(){int x=3;x${op}1.5;}`);
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('requires supported integer operands');
});
it('rejects assigning to an array object', () => {
  const result = run('int main(){int a[2];a*=2;}');
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('invalid arithmetic compound assignment');
});
