import { expect, it } from 'vitest';
import { starterScaffolds } from './starterScaffolds';
import { run } from './vm/interpreter';
it.each(Object.entries(starterScaffolds))('%s starter runs and cleans up its sample input', (_key, starter) => {
 const result=run(starter.code);
 expect(result.error).toBeUndefined(); expect(result.status).toBe('ok');
 expect(result.trace.view?.stdout).toBe(starter.output); expect(result.leaks).toEqual([]);
 expect(result.trace.steps.length).toBeGreaterThan(0);
});
it('tree starter accepts an explicitly inserted height function and call',()=>{
 const source=starterScaffolds.tree.code.replace('// Add your function here, for example: int height(Node *root) { ... }',
  'int height(Node *root){if(!root)return 0;int l=height(root->left);int r=height(root->right);return 1+(l>r?l:r);}')
 .replace('printf("Root: %d", root->value);','printf("%d",height(root));');
 const result=run(source);expect(result.error).toBeUndefined();expect(result.trace.view?.stdout).toBe('2');
});
