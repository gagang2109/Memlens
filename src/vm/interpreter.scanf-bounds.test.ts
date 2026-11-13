import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
describe('scanf character destination boundaries',()=>{
  it.each(['%s','%3c'])('does not cross from a local char buffer into its neighbor: %s', format=>{
    const result=run(`int main(){char a[2]="a";char b[4]="bbb";scanf("${format}",a);}`,100000,100,'xyz');
    expect(result.status).toBe('error');
    expect(result.error?.reason).toBe('scanf exceeds local array bounds');
    expect(result.trace.steps.at(-1)?.frames[0].locals.b).toBe('[b, b, b, \0]');
  });
  it('includes the terminating NUL in a string bounds check',()=>{
    const result=run('int main(){char a[3];char b[2];scanf("%3s",a);}',100000,100,'abc');
    expect(result.error?.reason).toBe('scanf exceeds local array bounds');
  });
  it('does not cross adjacent heap allocations',()=>{
    const result=run('int main(){char *a=malloc(2);char *b=malloc(4);scanf("%3s",a);}',100000,100,'abc');
    expect(result.status).toBe('error');
    expect(result.error?.reason).toBe('scanf exceeds heap allocation bounds');
  });
  it.each([
    ['char a[4];scanf("%3s",a);printf("%s",a);','abc'],
    ['char a[3];scanf("%3c",a);printf("%c%c%c",a[0],a[1],a[2]);','abc'],
    ['char a[5]="xxxx";scanf("%2s",a+2);printf("%s",a);','xxab'],
    ['char *a=malloc(4);scanf("%3s",a);printf("%s",a);free(a);','abc'],
  ])('preserves valid bounded writes: %s',(body,output)=>{
    const result=run(`int main(){${body}}`,100000,100,'abc');
    expect(result.status,result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe(output);
  });
});

it('preserves writer dispatch when simulated heap and local addresses overlap',()=>{
  const result=run('int main(){char *p=malloc(24578);char a[4];scanf("%3s",a);printf("%s",a);}',100000,100,'abc');
  expect(result.status,result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('abc');
});
