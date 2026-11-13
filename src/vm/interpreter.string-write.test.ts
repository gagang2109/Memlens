import {expect,it} from 'vitest';
import {run} from './interpreter';
it('copies into a local character buffer suffix',()=>{
const r=run('int main(){char s[16]="abcdef";strcpy(&s[2],"XY");printf("%s",s);return 0;}');
expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('abXY');
});
it('concatenates through a local character buffer suffix',()=>{
const r=run('int main(){char s[16]="abcd";strcat(&s[2],"XY");printf("%s",s);return 0;}');
expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('abcdXY');
});
it('handles array parameters, empty strings, and exact-fit terminators',()=>{
const r=run('void copy(char *p){strcpy(p,"XY");} int main(){char s[5]="abcd";copy(&s[2]);printf("%s ",s);strcpy(&s[2],"");printf("%s",s);return 0;}');
expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('abXY ab');
});
it('evaluates a destination index only once and returns the pointer',()=>{
const r=run('int main(){char s[5]="abcd";int i=2;char *p=strcpy(&s[i++],"X");printf("%s %s %d",s,p,i);return 0;}');
expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('abX X 3');
});
it.each(['strcpy(&s[2],"XYZ")','strcat(&s[2],"X")','strcpy(s,"12345")'])('rejects a local-buffer overflow: %s',call=>{
const r=run('int main(){char s[5]="abcd";'+call+';printf("continued");return 0;}');
expect(r.status).toBe('error');expect(r.error?.reason).toContain('exceeds local array bounds');expect(r.trace.steps.at(-1)?.stdout).not.toContain('continued');
});
