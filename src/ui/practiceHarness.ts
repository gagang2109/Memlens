import { parse } from '../lang/parser';

/** Append test code without shifting the student's source lines. */
export function practiceSource(code: string, setup: string) {
  const active = setup.trim().length > 0;
  const setupStart = code.split(/\r?\n/).length + 1;
  return {
    source: active ? `${code}\n${setup}` : code,
    active,
    setupStart,
    location(line: number) { return active && line >= setupStart ? `test setup line ${line - setupStart + 1}` : `source line ${line}`; },
    diagnostic(message: string) { return active ? message.replace(/\bline (\d+)/g, (_, line) => this.location(Number(line))) : message; },
  };
}

export function validatePracticeSource(source: string, active: boolean) {
  if (!active) return;
  // Do not run both an implicit test call and main, or silently ignore main.
  // Other parse failures are handled by the normal runner with trace locations.
  let program;
  try { program = parse(source); } catch { return; }
  if (program.functions.has('main')) throw new Error('Test setup is for functions or snippets without main(). Clear test setup to run a full main() program.');
}

export const treeHeightCode = `typedef struct Node {
    int value;
    struct Node *left;
    struct Node *right;
} Node;

// Height counts nodes: empty tree = 0, leaf = 1.
int height(Node *root) {
    if (!root) return 0;
    int left = height(root->left);
    int right = height(root->right);
    return 1 + (left > right ? left : right);
}`;

export const treeHeightSetup = `// Explicit sample inputs: a root with one left child.
Node *root = malloc(sizeof(Node));
Node *child = malloc(sizeof(Node));
root->value = 10;
root->left = child;
root->right = NULL;
child->value = 5;
child->left = NULL;
child->right = NULL;
printf("Height: %d", height(root));
free(child);
free(root);`;
