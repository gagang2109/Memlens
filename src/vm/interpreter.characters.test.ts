import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
const check=(body:string, expected:string,input='')=>{const result=run(`int main(){${body}return 0;}`,100000,100,input);expect(result.status).toBe('ok');expect(result.trace.steps.at(-1)?.stdout).toBe(expected);};
describe('basic execution character promotion',()=>{
  it('preserves empty string pointer non-nullness',()=>check(`char *p="";printf("%d %d",p==NULL,p!=NULL);`,'0 1')); 
  it('preserves string-backed pointer identity',()=>check(`char *p="abc";printf("%d %d",p==p,p!=p);`,'1 0'));
  it('indexes a frequency table with a character difference',()=>check(`char c='B';int counts[3]={0,0,0};counts[c-'A']++;printf("%d %d %d",counts[0],counts[1],counts[2]);`,'0 1 0'));
  it('promotes digit and NUL characters rather than parsing their text',()=>check(`char c='7';printf("%d %d %d",c,c-'0','\\0'+0);`,'55 7 0'));
  it('preserves strings after incrementing local character cells',()=>check(`char s[4]="abc";s[0]++;s[1]='X';printf("%s",s);`,'bXc'));
  it('preserves strings after incrementing heap character cells',()=>check(`char *s=malloc(4);strcpy(s,"abc");s[0]++;printf("%s",s);free(s);`,'bbc'));
  it('prints numeric %c with unsigned-char conversion',()=>check(`printf("%c %c",65,321);`,'A A'));
  it('supports representable plain and unsigned char values without assuming plain-char signedness',()=>check(`char a='7';unsigned char b='A';printf("%d %d",a-'0',b-65);`,'7 0'));
  it('promotes scanf character inputs',()=>check(`char c;scanf("%c",&c);printf("%d %d",c,c-'0');`,'56 8','8'));
  it('preserves numeric pointers and their scaled arithmetic',()=>check(`int *a=malloc(3*sizeof(int));a[0]=11;a[1]=22;a[2]=33;int *p=a;p++;printf("%d %d",*p,p==&a[1]);free(a);`,'22 1'));
});

it('promotes character memset fills and subsequent character arithmetic together', () => {
  const result = run(`int main() { char text[4]="abc"; memset(text, 'A', 2); text[1]++; printf("%s %d", text, text[1]-'A'); }`);
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('ABc 1');
});

it('promotes scanf character input before a local memset fill', () => {
  const result = run(`int main() { char c; char text[3]="ab"; scanf("%c", &c); memset(text, c, 2); printf("%s %d", text, c-'A'); }`, 100000, 100, 'C');
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('CC 2');
});
