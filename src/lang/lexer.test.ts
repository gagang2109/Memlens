import { describe, expect, it } from 'vitest';
import { lex } from './lexer';

describe('quoted literal scanning', () => {
  it('decodes escapes once, without reinterpreting escaped backslashes', () => {
    expect(lex(String.raw`"\\n\\0\n\t\0\"\'\\"`)[0].value).toBe('\\n\\0\n\t\0"\'\\');
  });
  it('keeps following token columns and line numbers correct', () => {
    const tokens = lex('"a\\\"b";\n42');
    expect(tokens[1]).toMatchObject({ value: ';', line: 1, column: 7 });
    expect(tokens[2]).toMatchObject({ value: '42', line: 2, column: 1 });
  });
  it.each([String.raw`'\''`, String.raw`'\\'`, String.raw`'\0'`, String.raw`'\n'`])('accepts escaped character %s', source => {
    expect(lex(source)[0]).toMatchObject({ kind: 'char' });
    expect(lex(source)[0].value).toHaveLength(1);
  });
  it.each(['"abc', "'a", '"abc\\', '"abc\nrest"', "'a\n'"] )('reports unterminated source %j at its opening line', source => {
    expect(() => lex('\n' + source)).toThrow(/line 2: unterminated/);
  });
  it.each(["''", "'ab'"])('does not silently accept unsupported multicharacter literal %s', source => {
    expect(() => lex(source)).toThrow(/single character/);
  });
  it('decodes bounded octal and hexadecimal byte escapes', () => {
    expect(lex(String.raw`"\101\x42\012\0"`)[0].value).toBe('AB\n\0');
  });
  it.each([String.raw`"\x"`, String.raw`"\x100"`, String.raw`"\777"`, String.raw`"\q"`])('reports invalid or unsupported escape %s', source => {
    expect(() => lex(source)).toThrow(/line 1:/);
  });
});
