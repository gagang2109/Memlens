import { expect, it } from 'vitest';
import { run } from './interpreter';
it.each(['(', ')', 'int', 'struct', 'NULL', 'if', ';', ','])('prints literal %s without treating it as syntax', text => {
  const result = run(`int main(){printf("${text}");return 0;}`);
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe(text);
});
it('recognizes parentheses in a basic balanced-bracket scan', () => {
 const result=run(`int main(){char s[5]="(())";int depth=0;for(int i=0;i<4;i++){if(s[i]=='(')depth++;else if(s[i]==')')depth--;}printf("%d",depth);return 0;}`);
 expect(result.status,result.error?.reason).toBe('ok');
 expect(result.trace.steps.at(-1)?.stdout).toBe('0');
});
it('preserves delimiter-valued literals in returns and array initializers', () => {
 const result=run(`char separator(){return ';';}int main(){char a[3]={'}',',',';'};printf("%c%c%c%c",separator(),a[0],a[1],a[2]);return 0;}`);
 expect(result.status,result.error?.reason).toBe('ok');
 expect(result.trace.steps.at(-1)?.stdout).toBe(';},;');
});
it('does not treat a string containing a known struct type as sizeof-like syntax', () => {
 const result=run(`typedef struct Node {int value;} Node;int main(){printf("Node");return 0;}`);
 expect(result.status,result.error?.reason).toBe('ok');
 expect(result.trace.steps.at(-1)?.stdout).toBe('Node');
});
it.each(['+', '-', '*', '/', '=', '==', '&&', '||', '?', ':', 'char', 'long', 'void', 'sizeof'])('keeps literal %s distinct from operators and types', text => {
 const result=run(`int main(){printf("${text}");return 0;}`);
 expect(result.status,result.error?.reason).toBe('ok');
 expect(result.trace.steps.at(-1)?.stdout).toBe(text);
});
it.each([
 'int main(){printf("hello" ")";}',
 'int main(){return 1 "+" 2;}',
 'int main(){int x "=" 3;}',
 'int main(){if(1 ")" return 0;}',
])('rejects quoted tokens used in place of required syntax', source => {
 expect(run(source).status).toBe('error');
});
