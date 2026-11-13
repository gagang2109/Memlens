import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
describe('NUL termination of string-backed sources', () => {
  it.each([
    ['heap copy', 'char *s=malloc(2);strcpy(s,"a\\0hidden");printf("%s %d",s,strlen(s));free(s);', 'a 1'],
    ['local source', 'char src[6]="ab\\0cd";char dst[3];strcpy(dst,src);printf("%s %d",dst,strlen(dst));', 'ab 2'],
    ['empty prefix', 'printf("%d",strlen("\\0hidden"));', '0'],
    ['local newline after terminator', 'char s[6]="a\\0\\nb";printf("%d",strlen(s));', '1'],
    ['indexed newline after terminator', 'char s[6]="ab\\0\\nc";printf("%d",strlen(&s[1]));', '1'],
    ['literal length', 'printf("%d",strlen("ab\\0cd"));', '2'],
    ['string pointer length', 'char *s="ab\\0cd";printf("%d",strlen(s));', '2'],
    ['copy stops before hidden suffix', 'char s[3]="zz";strcpy(s,"a\\0hidden");printf("%s %d",s,strlen(s));', 'a 1'],
    ['append stops before hidden suffix', 'char s[4]="a";strcat(s,"b\\0hidden");printf("%s %d",s,strlen(s));', 'ab 2'],
  ])('%s', (_name, body, output) => {
    const result=run(`int main(){${body}}`);
    expect(result.status,result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe(output);
  });
});

it('retains bounds diagnostics when the visible prefix is too large', () => {
  const result=run('int main(){char s[2];strcpy(s,"ab\\0hidden");}');
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('exceeds local array bounds');
});
