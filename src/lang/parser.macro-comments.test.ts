import { expect, it } from 'vitest';
import { run } from '../vm/interpreter';
it.each(['#define N 3 // number', '#define N 3 /* number */'])('numeric define comment: %s', directive => {
 const r=run(`${directive}\nint main(){printf("%d",N);return 0;}`);
 expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('3');
});
it('ignores directives inside multiline comments',()=>{
 const r=run('/*\n#define N 99\n*/\nint main(){int N=3;printf("%d",N);}');
 expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('3');
});
it('preserves quoted comment markers',()=>{
 const r=run('#define URL "https://example.test/*path*/"\nint main(){printf("%s",URL);}');
 expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('https://example.test/*path*/');
});
it('handles multiline trailing comments without losing code lines',()=>{
 const r=run('#define N 3 /* comment\nmore */\nint main(){printf("%d",N);}');
 expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('3');
});
import { parse } from './parser';
import { stripComments } from './comments';
it('preserves diagnostic line after multiline comment',()=>{
 expect(()=>parse('/* first\nsecond */\nint main(){\nint x = 09;\n}')).toThrow(/line 4:/);
});
it('preserves escaped quotes and comment markers inside literals',()=>{
 const text=String.raw`"a\"//b/*c*/"`;
 expect(stripComments(text+' /* removed */').text).toBe(text+'              ');
});
it('replaces a comment between identifiers with whitespace',()=>{
 const r=run('int/**/main(){int/**/value=3;printf("%d",value);}');
 expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('3');
});

it.each([
  '#define N /* starts\ncontinues */ 3',
  '#define /* starts\ncontinues */ N /* starts\ncontinues */ 3',
  '#/**/define/**/N/**/3',
])('reads a numeric macro across comment whitespace: %s', directive => {
  const result = run(`${directive}\nint main(){printf("%d",N);}`);
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('3');
});

it('keeps the physical source line after consuming a multiline directive', () => {
  expect(() => parse('#define N /* first\nsecond */ 3\nint main(){\nint x = 09;\n}'))
    .toThrow(/line 4: invalid numeric literal/);
});

it('reports a bad macro number on its physical line', () => {
  expect(() => parse('#define N /* first\nsecond */ 09\nint main(){}'))
    .toThrow(/line 2: invalid numeric literal/);
});

it('reports an unterminated macro comment at its opening line', () => {
  expect(() => parse('\n#define N 3 /* first\nsecond'))
    .toThrow(/line 2: unterminated block comment/);
});

it('keeps CRLF physical line numbering in a directive and in code', () => {
  const directive = '#define N /* first\r\nsecond */ 3\r\n';
  const result = run(directive + 'int main(){\r\nprintf("%d", N);\r\n}');
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('3');
  expect(() => parse(directive + 'int main(){\r\nint x = 09;\r\n}'))
    .toThrow(/line 4: invalid numeric literal/);
});
