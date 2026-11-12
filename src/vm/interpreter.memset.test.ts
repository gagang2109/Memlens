import { expect, it } from "vitest";
import { run } from "./interpreter";
it('zeroes a local int array', () => {
 const result=run('int main(){int a[3]={7,8,9}; memset(a,0,12); printf("%d %d %d",a[0],a[1],a[2]);}');
 expect(result.status,result.error?.reason).toBe('ok');
 expect(result.trace.steps.at(-1)?.stdout).toBe('0 0 0');
});

it.each([
 ['int a[3]={7,8,9}; memset(&a[1],0,4); printf("%d %d %d",a[0],a[1],a[2]);','7 0 9'],
 ['char a[5]="abcd"; memset(&a[1],88,2); printf("%s",a);','aXXd'],
 ['char a[5]="abcd"; memset(a,0,1); printf("[%s]",a);','[]'],
 ['char a[5]="abcd"; memset(a,344,2); printf("%s",a);','XXcd'],
 ['int a[2]={7,9}; memset(a,256,8); printf("%d %d",a[0],a[1]);','0 0'],
 ['int a[2]={7,9}; int n=0; memset(a,0,n++); printf("%d %d %d",a[0],a[1],n);','7 9 1'],
 ['int a[2]={7,9}; int *p=memset(a,0,8); printf("%d %d",p[0],p[1]);','0 0'],
 ['int a[2][2]={{1,2},{3,4}}; memset(a,0,16); printf("%d %d",a[0][0],a[1][1]);','0 0'],
 ['int *a=malloc(8); a[0]=7; a[1]=9; memset(a,0,8); printf("%d %d",a[0],a[1]); free(a);','0 0']
])('supports local memset: %s', (body, expected) => {
 const result=run('int main(){'+body+'}');
 expect(result.status,result.error?.reason).toBe('ok');
 expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
});
it.each([
 ['int a[2]; memset(a,0,9);','memset exceeds local array bounds'],
 ['int a[2]; memset(a,0,1);','unsupported memset on local array'],
 ['int a[2]; memset(a,1,8);','unsupported memset on local array'],
 ['char a[2]; memset(a,0,-1);','invalid memset length'],
 ['char *a=malloc(2); free(a); memset(a,0,1);','use-after-free']
])('diagnoses unsupported or invalid memset: %s',(body, reason)=>{
 const result=run('int main(){'+body+'}');
 expect(result.status).toBe('error');
 expect(result.error?.reason).toContain(reason);
});
it('supports char-array aliases passed to a function',()=>{
 const result=run('void clear(char *p){memset(&p[1],88,2);} int main(){char a[5]="abcd"; clear(a); printf("%s",a);}');
 expect(result.status,result.error?.reason).toBe('ok');
 expect(result.trace.steps.at(-1)?.stdout).toBe('aXXd');
});
it('keeps zero-count null memset a no-op',()=>{
 const result=run('int main(){memset(NULL,0,0); printf("ok");}');
 expect(result.status,result.error?.reason).toBe('ok');
 expect(result.trace.steps.at(-1)?.stdout).toBe('ok');
});
it.each(['1.5','"bad"'])('rejects malformed pointer %s without updating local arrays',(pointer)=>{
 const result=run('int main(){char a[3]="ab"; memset('+pointer+',0,1);}');
 expect(result.status).toBe('error');
 expect(result.error?.reason).toBe('invalid pointer dereference');
});
it('rejects misaligned integer zero fills instead of guessing byte layout',()=>{
 const result=run('int main(){int a[2]={7,9}; char *p=(char*)a; memset(&p[1],0,4);}');
 expect(result.status).toBe('error');
 expect(result.error?.reason).toContain('unsupported memset on local array');
});
it('preserves heap dispatch where simulated address ranges overlap',()=>{
 const result=run('int main(){char *p=malloc(24580); char a[2]="x"; memset(p+24576,0,1); printf("%s",a); free(p);}');
 expect(result.status,result.error?.reason).toBe('ok');
 expect(result.trace.steps.at(-1)?.stdout).toBe('x');
});
it('preserves freed-heap diagnostics where simulated ranges overlap',()=>{
 const result=run('int main(){char *p=malloc(24580); char a[2]="x"; free(p); memset(p+24576,0,1);}');
 expect(result.status).toBe('error');
 expect(result.error?.reason).toBe('use-after-free');
});
