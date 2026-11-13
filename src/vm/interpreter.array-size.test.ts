import { describe, expect, it } from 'vitest';
import { run } from './interpreter';

describe('bounded local array sizes', () => {
  it.each(['int a[0];', 'int a[-2][-2];', 'int a[1.5];'])('rejects invalid dimensions before allocation: %s', declaration => {
    const result = run(`int main(){ ${declaration} printf("continued"); }`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toBe('array dimensions must be positive integers');
    expect(result.trace.steps.at(-1)?.stdout).not.toContain('continued');
  });
  it.each(['char a[65537];', 'int a[16385];', 'int a[129][129];'])('rejects arrays above the byte limit: %s', declaration => {
    const result = run(`int main(){ ${declaration} printf("continued"); }`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toBe('local array exceeds simulator limit (65536 bytes)');
  });
  it('allows the exact char-array limit', () => {
    const result = run('int main(){ char a[65536]; a[65535]=65; printf("%c", a[65535]); }');
    expect(result.status, result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('A');
  });
  it('preserves ordinary matrix lab programs', () => {
    const result = run('int main(){ int a[2][3]; a[1][2]=42; printf("%d",a[1][2]); }');
    expect(result.status).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('42');
  });
});

it('rejects an enormous size without creating array storage', () => {
  const result = run('int main(){ int a[1000000000]; }');
  expect(result.error?.reason).toBe('local array exceeds simulator limit (65536 bytes)');
  expect(result.trace.steps.at(-1)?.frames[0].locals).not.toHaveProperty('a');
});

it.each([
  ['int a[]={7}; printf("%d",a[0]);', '7'],
  ['int a[]={7,8,9}; printf("%d %d",a[0],a[2]);', '7 9'],
  ['char text[]="abc"; printf("%s %d",text,text[3]);', 'abc 0'],
  ['char text[]=""; printf("%d",text[0]);', '0'],
])('infers a supported omitted bound: %s', (body, expected) => {
  const result = run(`int main(){ ${body} }`);
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
});
it.each(['int a[];', 'int a[][2]={{1,2},{3,4}};'])('explains unsupported omitted-bound forms: %s', declaration => {
  const result = run(`int main(){ ${declaration} }`);
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('unsupported omitted array bound');
});

it.each([
  ['char a[]={"abc"}; printf("%s %d",a,a[3]);', 'abc 0'],
  ['char a[]={""}; printf("%d",a[0]);', '0'],
  ["char a[]={'a','b','\\0'}; printf(\"%s\",a);", 'ab'],
])('preserves char initializer forms: %s', (body, expected) => {
  const result=run(`int main(){ ${body} }`);
  expect(result.status,result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
});
it('does not infer an array from a character scalar', () => {
  const result=run("int main(){char a[]='x';}");
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('unsupported omitted array bound');
});

it('rejects multiple strings as one-dimensional character elements', () => {
  const result=run('int main(){char a[]={"ab","cd"};}');
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('unsupported char array initializer');
});
