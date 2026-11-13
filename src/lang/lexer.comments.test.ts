import { describe, expect, it } from 'vitest';
import { lex } from './lexer';
import { run } from '../vm/interpreter';

describe('C comments', () => {
  it.each(['/*', '/* unfinished', '/* unfinished *', '/* one\n two', '/*/'])('reports unterminated block comment %j at its opening line', source => {
    expect(() => lex('\n\n' + source)).toThrow('line 3: unterminated block comment');
  });
  it('rejects an unfinished comment even after a complete valid program', () => {
    const result = run('int main(){return 0;}\n/* unfinished');
    expect(result.status).toBe('error');
    expect(result.error?.reason).toContain('line 2: unterminated block comment');
  });
  it('reports the unmatched opener, not an earlier closed comment', () => {
    expect(() => lex('/* done */\n/* unfinished\n')).toThrow('line 2: unterminated block comment');
  });
  it('tracks token and EOF positions after multiline comments', () => {
    expect(lex('/* first\nsecond */42')).toEqual([
      { kind: 'number', value: '42', line: 2, column: 10 },
      { kind: 'eof', value: '', line: 2, column: 12 },
    ]);
  });
  it.each(['/**/', '/***/', '/* /* nested-looking */', '/* // line-looking */'])('accepts complete comment %j', source => {
    expect(lex(source)).toEqual([{ kind: 'eof', value: '', line: 1, column: source.length + 1 }]);
  });
  it('preserves tokens on either side and does not merge identifiers', () => {
    expect(lex('int/**/value;').map(t => t.value)).toEqual(['int', 'value', ';', '']);
  });
  it('does not recognize block markers inside literals or line comments', () => {
    expect(lex('"/*" \'/\' \'*\' // /* unfinished').map(t => t.value)).toEqual(['/*', '/', '*', '']);
    expect(lex('// /*\n42')[0]).toMatchObject({ kind: 'number', value: '42', line: 2, column: 1 });
  });
  it('runs valid comments alongside quoted markers', () => {
    const result = run('int/**/main(){/* first\nsecond */printf("/* */");return 0;}// unfinished block marker: /*');
    expect(result.status, result.error?.reason).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('/* */');
  });
});
