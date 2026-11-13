import {describe,expect,it} from 'vitest';
import{run}from'./interpreter';
function check(body:string,output:string){
const r=run('int main(){'+body+'return 0;}');
expect(r.status,r.error?.reason).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe(output);
}
describe('right-associative compound assignments',()=>{
it('chains additions',()=>check('int x=10,y=4;x+=y+=2;printf("%d %d",x,y);','16 6'));
it('chains subtraction',()=>check('int x=10,y=4;x-=y-=2;printf("%d %d",x,y);','8 2'));
it('mixes assignment and compound operators',()=>check('int x=10,y=4,z=3;x+=y=z+=2;printf("%d %d %d",x,y,z);','15 5 5'));
it('supports initialization from a compound chain',()=>check('int x=10,y=4;int z=x+=y+=2;printf("%d %d %d",x,y,z);','16 6 16'));
it('evaluates each indexed target once',()=>check('int a[2]={10,20};int b[2]={4,5};int i=0,j=0;a[i++]+=b[j++]+=2;printf("%d %d %d %d",a[0],b[0],i,j);','16 6 1 1'));
it('keeps ordinary arithmetic left-associative',()=>check('int x=20-5-3;int y=24/4/2;printf("%d %d",x,y);','12 3'));
it('keeps short-circuited chains unevaluated',()=>check('int x=10,y=4;int a=0&&(x+=y+=2);int b=1||(x-=y-=2);printf("%d %d %d %d",x,y,a,b);','10 4 0 1'));
it('handles an unselected conditional arm without mutations',()=>check('int x=10,y=4;int z=1?9:(x+=y+=2);printf("%d %d %d",x,y,z);','10 4 9'));
it.each(['1+=2;','int x=1;(x+1)+=2;'])('still rejects non-lvalue target %s',body=>{
const r=run('int main(){'+body+'return 0;}');expect(r.status).toBe('error');expect(r.error?.reason).toContain('not assignable');
});
});
