import { describe, expect, it } from 'vitest';
import { run } from './interpreter';

describe('sizeof fixed int and char arrays', () => {
  it.each([
    ['int a[3];', 'sizeof(a)', '12'],
    ['char a[7];', 'sizeof(a)', '7'],
    ['int a[2][3];', 'sizeof(a)', '24'],
    ['int a[2][3];', 'sizeof(a[0])', '12'],
    ['int a[2][3];', 'sizeof(a[0][0])', '4'],
    ['char a[]="abc";', 'sizeof(a)', '4'],
    ['int a[2][3]; int i=0;', 'sizeof(a[i++])', '12'],
  ])('%s %s', (setup, expression, expected) => {
    const result = run(`int main(){ ${setup} printf("%d", ${expression}); }`);
    expect(result.status, result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
  });
  it('does not evaluate index side effects or access an out-of-range element', () => {
    const result = run('int main(){ int a[2][3]; int i=99; printf("%d %d",sizeof(a[i++][99]),i); }');
    expect(result.status, result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('4 99');
  });
});

// These cases guard the boundary of this fix, not native pointer-size correctness.
it.each([
  ['int main(){ int *a[3]; printf("%d",sizeof(a)); }', '16'],
  ['int size(int a[]){ return sizeof(a); } int main(){ int a[3]; printf("%d",size(a)); }', '16'],
  ['int a[3]; int main(){ printf("%d",sizeof(a)); }', '12'],
  ['int main(){ char a[2][3][4]; printf("%d %d",sizeof(a),sizeof(a[0][0])); }', '24 4'],
  ['int size(){ char a[7]; return sizeof(a); } int main(){ int a[3]; printf("%d %d",size(),sizeof(a)); }', '7 12'],
])('preserves array metadata scope: %s', (source, expected) => {
  const result = run(source);
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
});
