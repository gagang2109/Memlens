import {it,expect} from 'vitest';
import {run} from './interpreter';
it('reads a suffix of a local character buffer',()=>{
 const r=run('int main(){ char word[8]="stack"; printf("%s %d", &word[2], strlen(&word[2])); }');
 expect(r.status).toBe('ok'); expect(r.trace.steps.at(-1)?.stdout).toBe('ack 3');
});
it('reads modified suffix through a char pointer parameter',()=>{
 const r=run('void show(char *p){ printf("%s",p); } int main(){ char word[8]="stack"; word[2]=\'o\'; show(&word[2]); }');
 expect(r.status).toBe('ok'); expect(r.trace.steps.at(-1)?.stdout).toBe('ock');
});
it('stops suffix strings at their NUL terminator',()=>{
 const r=run('int main(){ char word[8]="stack"; word[3]=0; printf("%s:%d:%s", &word[2], strlen(&word[2]), &word[3]); }');
 expect(r.status).toBe('ok'); expect(r.trace.steps.at(-1)?.stdout).toBe('a:1:');
});
it('compares and copies source suffixes from local buffers',()=>{
 const r=run('int main(){ char word[8]="stack"; char out[8]; strcpy(out,&word[2]); printf("%s %d",out,strcmp(&word[2],"ack")); }');
 expect(r.status).toBe('ok'); expect(r.trace.steps.at(-1)?.stdout).toBe('ack 0');
});
it('resolves the owning live buffer even with a same-name callee array',()=>{
 const r=run('void show(char *p){ char word[8]="other"; printf("%s",p); } int main(){ char word[8]="stack"; show(&word[2]); }');
 expect(r.status).toBe('ok'); expect(r.trace.steps.at(-1)?.stdout).toBe('ack');
});
it('does not relax bounds checking when obtaining a suffix address',()=>{
 const r=run('int main(){ char word[8]="stack"; printf("%s",&word[9]); }');
 expect(r.status).toBe('error'); expect(r.error?.reason).toMatch(/out of bounds/);
});
