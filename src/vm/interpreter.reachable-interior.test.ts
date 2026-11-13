import { describe, expect, it } from 'vitest';
import { run } from './interpreter';

describe('reachability through allocation-interior pointers', () => {
  it('does not recurse forever when a node points inside its own allocation', () => {
    const result = run(`typedef struct Node { int data; struct Node *next; } Node;
      int main() { Node *head=malloc(2*sizeof(Node)); head->next=head+1; printf("done"); }`);
    expect(result.status, result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('done');
    expect(result.leaks).toHaveLength(1);
    expect(result.orphanedAtExit).toEqual([]);
  });
  it('treats an interior pointer held by a live variable as a root', () => {
    const result = run('int main(){ int *p=malloc(3*sizeof(int)); int *q=p+1; p=NULL; printf("done"); }');
    expect(result.status).toBe('ok');
    expect(result.orphanedAtExit).toEqual([]);
  });
  it('still identifies an allocation with no remaining root as orphaned', () => {
    const result = run('int main(){ int *p=malloc(3*sizeof(int)); p=NULL; }');
    expect(result.status).toBe('ok');
    expect(result.orphanedAtExit).toHaveLength(1);
  });
});
