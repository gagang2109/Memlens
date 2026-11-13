import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
describe('loop control cannot escape a function',()=>{
  it.each(['break','continue'])('rejects %s in a called function instead of controlling its caller',keyword=>{
    const result=run(`int helper(){\n${keyword};\nreturn 0;}\nint main(){int i=0;while(i<3){i++;helper();}printf("continued");}`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toContain(keyword+' outside');
    expect(result.error?.line).toBe(2);
    expect(result.trace.steps.at(-1)?.stdout).not.toContain('continued');
  });
  it.each(['break','continue'])('explains %s outside any loop in main',keyword=>{
    const result=run(`int main(){\n${keyword};\n}`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toContain(keyword+' outside');
    expect(result.error?.line).toBe(2);
  });
  it('preserves a helper with its own loop control',()=>{
    const result=run('int helper(){int i=0;while(i<4){i++;if(i==1)continue;if(i==3)break;}return i;}int main(){printf("%d",helper());}');
    expect(result.status,result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('3');
  });
});
it('does not let a helper break escape into a caller switch',()=>{
  const result=run('int helper(){break;}int main(){switch(1){case 1:helper();}printf("continued");}');
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('break outside loop or switch');
  expect(result.trace.steps.at(-1)?.stdout).not.toContain('continued');
});
it('keeps continue through a switch inside the helper own loop',()=>{
  const result=run('int helper(){int i=0;int sum=0;while(i<3){i++;switch(i){case 1:continue;default:break;}sum+=i;}return sum;}int main(){printf("%d",helper());}');
  expect(result.status,result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('5');
});
