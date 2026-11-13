import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
describe('C octal integer literals and malformed numbers',()=>{
  it('interprets leading-zero integers in base eight',()=>{
    const result=run('int main(){printf("%d %d %d %d",010,077,-010,0);}');
    expect(result.status,result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('8 63 -8 0');
  });
  it('uses the same integer interpretation in simple numeric macros',()=>{
    const result=run('#define COUNT 010\n#define NEG -010\nint main(){printf("%d %d",COUNT,NEG);}');
    expect(result.status,result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('8 -8');
  });
  it.each(['09','018','1.2.3'])('rejects malformed numeric literal %s',value=>{
    const result=run(`int main(){\nint x=${value};\n}`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toContain('invalid numeric literal');
    expect(result.error?.line).toBe(2);
  });
  it('does not reinterpret decimal floating literals as octal',()=>{
    const result=run('int main(){printf("%.1f %.1f %d",010.0,0.5,10);}');
    expect(result.status,result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('10.0 0.5 10');
  });
});

it('rejects an invalid octal simple macro on its definition line',()=>{
  const result=run('#define COUNT 09\nint main(){int n=COUNT;}');
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('invalid numeric literal');
  expect(result.error?.line).toBe(1);
});

it.each(['1.2.3','-1..2'])('rejects a malformed numeric macro %s instead of retaining it as text', value=>{
  const result=run(`\n#define COUNT ${value}\nint main(){printf("%d",COUNT);}`);
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('invalid numeric literal');
  expect(result.error?.line).toBe(2);
});
it('preserves explicitly quoted numeric-looking string macros',()=>{
  const result=run('#define TEXT "1.2.3"\nint main(){printf("%s",TEXT);}');
  expect(result.status).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('1.2.3');
});
