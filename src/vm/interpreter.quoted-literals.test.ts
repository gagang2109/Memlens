import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
describe('quoted C literals', () => {
  it('prints quoted stack labels and quote characters', () => {
    const source = String.raw`#include <stdio.h>
int main(){printf("Stack \"top\": %c", '\'');return 0;}`;
    const result = run(source);
    expect(result.status, result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe(`Stack "top": '`);
  });
  it('distinguishes literal backslashes from escape sequences', () => {
    const result = run(String.raw`int main(){printf("C:\\temp\\new\\");return 0;}`);
    expect(result.status, result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('C:\\temp\\new\\');
  });
});

it('keeps escaped NUL and escaped backslash-zero distinct in string lab operations', () => {
  const result = run(String.raw`int main(){char s[8]="a\0b";printf("%d %s %s",strlen(s),s,"\\0");return 0;}`);
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe('1 a \\0');
});
it('reports malformed student strings rather than accepting truncated literals', () => {
  const result = run('int main(){\nprintf("unfinished\n); }');
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('line 2: unterminated string literal');
});
