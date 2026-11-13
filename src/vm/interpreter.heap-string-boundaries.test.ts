import {expect,it} from 'vitest';import {run} from './interpreter';
it.each([
['char *p=malloc(3);strcpy(p,"Hi");printf("%s",p);','Hi'],
['char *p=malloc(4);strcpy(p,"a");strcat(p,"bc");printf("%s",p);','abc'],
['char *p=malloc(8);strcpy(p,"abcdef");strcpy(&p[2],"X");printf("%s",p);','abX'],
['char *p=malloc(8);strcpy(p,"abcd");strcat(&p[2],"XY");printf("%s",p);','abcdXY'],
['char a[8]="abcdef";strcpy(&a[2],"X");printf("%s",a);','abX'],
['char *p=malloc(3);strcpy(p,"Hi");p=realloc(p,3);printf("%s",p);','Hi'],
])('valid %s',(body,out)=>{const r=run(`int main(){${body}}`);expect(r.status,r.error?.reason).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe(out);});
it('no partial writes when strcat overflows',()=>{const r=run('int main(){char *p=malloc(4);strcpy(p,"ab");strcat(p,"cd");}');expect(r.status).toBe('error');const m=r.trace.steps.at(-1)!.memory;expect(m.bytes.slice(4096,4100)).toEqual([97,98,0,0]);expect(m.shadows[4099]).toBe('allocated-uninitialized');});
