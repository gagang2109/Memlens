import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
describe('heap string writes', () => {
  it.each([
    ['strcpy(p,"Hi")', 'Hi', [72,105,0]],
    ['strcpy(p,"H");strcat(p,"i")', 'Hi', [72,105,0]],
    ['strcpy(p,"")', '', [0]],
    ['strcpy(p,"Hi");p=realloc(p,12)', 'Hi', [72,105,0]],
  ] as const)('initializes bytes and terminator: %s', (body, output, bytes) => {
    const result=run(`int main(){char *p=malloc(8);${body};printf("%s",p);return 0;}`);
    expect(result.status,result.error?.reason).toBe('ok');
    const last=result.trace.steps.at(-1)!;
    expect(last.stdout).toBe(output);
    const allocation=last.memory.allocations.at(-1)!;
    expect(last.memory.bytes.slice(allocation.address,allocation.address+bytes.length)).toEqual(bytes);
    expect(last.memory.shadows.slice(allocation.address,allocation.address+bytes.length)).toEqual(bytes.map(()=> 'initialized'));
    expect(last.memory.shadows[allocation.address+bytes.length]).toBe('allocated-uninitialized');
  });
  it.each(['char *p=malloc(2);strcpy(p,"Hi")','char *p=malloc(4);free(p);strcpy(p,"Hi")','char *p=NULL;strcpy(p,"Hi")'])('rejects invalid writes: %s',body=>{
    const r=run(`int main(){${body};printf("continued");}`);
    expect(r.status).toBe('error');
    expect(r.trace.steps.at(-1)?.stdout).not.toContain('continued');
  });
});
it('matches native C across concat, realloc, interior overwrite and free',()=>{
 const r=run('int main(){char *p=malloc(8);strcpy(p,"Hi");strcat(p,"!");p=realloc(p,12);printf("%s %d %d %d %d\\n",p,p[0],p[1],p[2],p[3]);strcpy(p+1,"X");printf("%s\\n",p);free(p);return 0;}');
 expect(r.status,r.error?.reason).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('Hi! 72 105 33 0\nHX\n');expect(r.leaks).toEqual([]);
});
it('accepts exact-fit heap copies and keeps earlier snapshots immutable',()=>{
 const r=run('int main(){char *p=malloc(3);printf("before");strcpy(p,"Hi");printf("%s",p);}');
 expect(r.status).toBe('ok');
 const before=r.trace.steps.find(s=>s.stdout==='before')!;const after=r.trace.steps.at(-1)!;
 const base=after.memory.allocations[0].address;
 expect(before.memory.shadows[base]).toBe('allocated-uninitialized');expect(after.memory.shadows[base]).toBe('initialized');
});
