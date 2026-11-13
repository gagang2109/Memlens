import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
const node = 'typedef struct Node { int data; struct Node *next; } Node;';
describe('cached pointers to heap members', () => {
  it.each(['printf("%d",*p);', '*p=9;', '(*p)++;'])('rejects access after owner is freed: %s', access => {
    const result = run(`${node} int main(){ Node *n=malloc(sizeof(Node)); n->data=42; int *p=&n->data; free(n); ${access} }`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toBe('use-after-free');
    expect(result.error?.allocation?.address).toBe(4096);
  });
  it('allows read/write through a live member pointer', () => {
    const result = run(`${node} int main(){ Node *n=malloc(sizeof(Node)); n->data=42; int *p=&n->data; *p=9; printf("%d %d",*p,n->data); free(n); }`);
    expect(result.status,result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('9 9');
  });
  it('preserves ordinary pointers to local scalar variables', () => {
    const result=run('int main(){int value=42;int *p=&value;*p=9;printf("%d",value);}');
    expect(result.status).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('9');
  });
});

it('reports the dereference line, not the earlier address-taking line', () => {
  const result=run(`${node}
int main(){
Node *n=malloc(sizeof(Node));
n->data=42;
int *p=&n->data;
free(n);
*p=9;
}`);
  expect(result.error?.reason).toBe('use-after-free');
  expect(result.error?.line).toBe(7);
  expect(result.trace.steps.at(-1)?.heap?.[0].fields.data).toBe('42');
});

it.each(['*p=release(n);', '*p+=release(n);', 'n->data=release(n);', 'n->data+=release(n);'])('rechecks liveness after RHS frees owner: %s', assignment => {
  const result=run(`${node}
int release(Node *node){free(node);return 9;}
int main(){
Node *n=malloc(sizeof(Node));
n->data=42;
int *p=&n->data;
${assignment}
}`);
  expect(result.status).toBe('error');
  expect(result.error?.reason).toBe('use-after-free');
  expect(result.error?.line).toBe(7);
  expect(result.trace.steps.at(-1)?.heap?.[0].fields.data).toBe('42');
});
