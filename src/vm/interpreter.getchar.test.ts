import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
const cases = [
  ['character code output', 'int c=getchar();printf("%d %c",c,c);', 'A', '65 A'],
  ['digit arithmetic', 'int c=getchar();printf("%d",c-48);', '7', '7'],
  ['empty and repeated EOF', 'int a=getchar();int b=getchar();printf("%d %d %d",a,b,EOF);', '', '-1 -1 -1'],
  ['newline or EOF loop', 'int c;int n=0;while((c=getchar())!=EOF && c!=\'\\n\'){n++;}int d=getchar();printf("%d %d",n,d);', 'abc\nZ', '3 90'],
  ['EOF loop', 'int c;int n=0;while((c=getchar())!=EOF){n++;}printf("%d",n);', 'ab\n', '3'],
  ['NUL is not EOF', 'int c=getchar();int d=getchar();printf("%d %d",c,d);', '\0', '0 -1'],
  ['scanf then getchar', 'int n;scanf("%d",&n);int c=getchar();printf("%d %d",n,c);', '12\n', '12 10'],
  ['getchar then scanf', 'int c=getchar();int n;scanf("%d",&n);printf("%d %d",c,n);', 'A12', '65 12'],
  ['matching failure leaves input', 'int n=9;scanf("%d",&n);int c=getchar();printf("%d %d",n,c);', 'x', '9 120'],
] as const;
describe('getchar EOF and existing character semantics', () => {
  it.each(cases)('%s', (_name, body, input, expected) => {
    const result=run(`int main(){${body}return 0;}`,100000,100,input);
    expect(result.status,result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
  });
  it('preserves character literal sentinel comparisons', () => {
    const result=run(`int main(){int c=getchar();printf("%d %d",c=='A',c!='A');}`,100000,100,'A');
    expect(result.status).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('1 0');
  });
});
