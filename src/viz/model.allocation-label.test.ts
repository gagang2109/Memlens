import { describe, expect, it } from 'vitest';
import { run } from '../vm/interpreter';
import { renderModel } from './model';
const node='typedef struct Node { int data; struct Node *next; } Node;';
describe('allocation labels survive pointer aliases',()=>{
  it('does not replace a Node label with int when taking a field address',()=>{
    const result=run(`${node} int main(){Node *head=malloc(sizeof(Node));head->data=42;int *p=&head->data;printf("%d",*p);}`);
    expect(result.status).toBe('ok');
    const step=result.trace.steps.at(-1)!;
    expect(renderModel(step).nodes[0]).toMatchObject({raw:false,value:'42',type:'struct Node'});
  });
  it('keeps a local struct visualized as a struct after a member alias',()=>{
    const result=run(`${node} int main(){Node n;n.data=42;int *p=&n.data;printf("%d",*p);}`);
    expect(result.status).toBe('ok');
    expect(renderModel(result.trace.steps.at(-1)!).nodes[0]).toMatchObject({raw:false,value:'42',type:'struct Node'});
  });
  it('preserves existing runtime stride behavior through a cast alias',()=>{
    const result=run('int main(){char *raw=malloc(8);int *a=(int*)raw;a[1]=42;printf("%d",(a+0)[1]);}');
    expect(result.status,result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)!.stdout).toBe('42');
    expect(result.trace.steps.at(-1)!.memory.allocations[0]).toMatchObject({elementSize:4,elementType:'int'});
  });
  it('allows an untyped void allocation to acquire a concrete Node label',()=>{
    const result=run(`${node} int main(){void *raw=malloc(sizeof(Node));Node *head=(Node*)raw;head->data=42;}`);
    expect(result.status).toBe('ok');
    expect(renderModel(result.trace.steps.at(-1)!).nodes[0]).toMatchObject({raw:false,value:'42',type:'struct Node'});
  });
  it('keeps ordinary scalar allocations raw',()=>{
    const result=run('int main(){int *a=malloc(12);a[0]=7;}');
    expect(renderModel(result.trace.steps.at(-1)!).nodes[0]).toMatchObject({raw:true,type:'int'});
  });
});
