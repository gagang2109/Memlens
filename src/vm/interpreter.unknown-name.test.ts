import { describe, expect, it } from 'vitest';
import { run } from './interpreter';

describe('undeclared identifier diagnostics', () => {
  it('does not silently substitute zero for a typo in a student program', () => {
    const result = run(`int main() {\n int total = 5;\n printf("%d", totla);\n}`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toBe('unknown variable totla');
    expect(result.error?.line).toBe(3);
    expect(result.trace.steps.at(-1)?.stdout).toBe('');
  });
  it('reports unknown names in arithmetic instead of returning a plausible answer', () => {
    const result = run('int main() { int answer = missing + 7; printf("%d", answer); }');
    expect(result.status).toBe('error');
    expect(result.error?.reason).toBe('unknown variable missing');
  });
  it('preserves zero-valued and string preprocessor constants and EOF', () => {
    const result = run('#define ZERO 0\n#define LABEL "ok"\nint main() { printf("%d %s %d", ZERO, LABEL, EOF); }');
    expect(result.status).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('0 ok -1');
  });
});
