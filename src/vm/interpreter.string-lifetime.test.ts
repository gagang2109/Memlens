import {describe,it,expect} from 'vitest';
import {run} from './interpreter';
describe('freed string source diagnostics',()=>{
  it.each([
    'printf("%s",s);', 'printf("%d",strlen(s));',
    'printf("%d",strcmp(s,"abc"));', 'printf("%d",strcmp("abc",s));',
    'char d[8]; strcpy(d,s);', 'char d[8]="x"; strcat(d,s);',
    'printf("%s",s+1);', 'printf(s);', 'scanf(s);'
  ])('rejects %s',operation=>{
    const r=run(`int main(){\nchar *s=malloc(4); strcpy(s,"abc");\nfree(s);\n${operation}\n}`);
    expect(r.status).toBe('error'); expect(r.error?.reason).toBe('use-after-free'); expect(r.error?.line).toBe(4);
  });
  it('preserves live heap strings, literals and local suffixes',()=>{
    const r=run('int main(){char *s=malloc(4);strcpy(s,"abc");char a[4]="xyz";printf("%s %s %s",s,s+1,a+1);free(s);}');
    expect(r.status).toBe('ok'); expect(r.trace.steps.at(-1)?.stdout).toBe('abc bc yz');
  });
});
