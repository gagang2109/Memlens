import { describe, expect, it } from 'vitest';
import { run } from './interpreter';

const node = 'typedef struct Node { int data; struct Node *next; } Node;';
describe('null member-access diagnostics', () => {
  it.each(['NULL', '0'])('diagnoses a read through a pointer set to %s', value => {
    const result = run(`${node} int main(){ Node *head=${value}; printf("%d",head->data); }`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toBe('null pointer dereference');
  });
  it('diagnoses a write through an empty-list head', () => {
    const result = run(`${node} int main(){ Node *head=NULL; head->data=4; }`);
    expect(result.error?.reason).toBe('null pointer dereference');
  });
  it('diagnoses traversal past the tail as null rather than invalid', () => {
    const result = run(`${node} int main(){ Node *head=malloc(sizeof(Node)); head->next=NULL; printf("%d",head->next->data); }`);
    expect(result.error?.reason).toBe('null pointer dereference');
  });
  it('preserves invalid nonnull and use-after-free diagnostics', () => {
    const invalid = run(`${node} int main(){ Node *head=123; printf("%d",head->data); }`);
    expect(invalid.error?.reason).toBe('invalid pointer dereference');
    const freed = run(`${node} int main(){ Node *head=malloc(sizeof(Node)); free(head); printf("%d",head->data); }`);
    expect(freed.error?.reason).toBe('use-after-free');
  });
});
