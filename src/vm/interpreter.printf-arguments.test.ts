import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
describe('printf missing conversion arguments',()=>{
  it.each(['%d','%s','%c','%f','%p','%+05d','%.2s'])('diagnoses a missing value for %s', format=>{
    const result=run(`int main(){printf("${format}");}`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toBe('missing printf argument');
    expect(result.trace.steps.at(-1)?.stdout).toBe('');
  });
  it('identifies a missing second value rather than exposing an internal exception',()=>{
    const result=run('int main(){printf("before");printf("%d %d",7);}');
    expect(result.error?.reason).toBe('missing printf argument');
    expect(result.trace.steps.at(-1)?.stdout).toBe('before');
  });
  it('does not count escaped percent as an argument',()=>{
    const result=run('int main(){printf("%% %d %%",7);}');
    expect(result.status).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('% 7 %');
  });
  it('preserves extra argument evaluation without requiring a conversion',()=>{
    const result=run('int main(){int x=0;printf("ok",++x);printf("%d",x);}');
    expect(result.status).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('ok1');
  });
});

it('diagnoses a missing format argument on the call line',()=>{
  const result=run('int main(){\nprintf();\n}');
  expect(result.error?.reason).toBe('missing printf format argument');
  expect(result.error?.line).toBe(2);
});
