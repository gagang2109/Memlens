import { describe, expect, it } from 'vitest';
import { run } from './interpreter';

describe('integer remainder', () => {
  it('matches C truncation-toward-zero remainder for signed operands', () => {
    const result = run('int main(){printf("%d %d %d %d",7%3,-7%3,7%-3,-7%-3);return 0;}');
    expect(result.status).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('1 -1 1 -1');
  });
  it.each(['0', '2-2'])('reports a zero divisor (%s) rather than propagating NaN', divisor => {
    const result = run(`int main(){int x=7%(${divisor});printf("continued");return 0;}`);
    expect(result.status).not.toBe('ok');
    expect(result.error?.reason).toContain('remainder by zero');
    expect(result.trace.steps.at(-1)?.stdout).not.toContain('continued');
  });
  it('does not evaluate a short-circuited remainder', () => {
    const result = run('int main(){printf("%d %d",0 && (7%0),1 || (7%0));return 0;}');
    expect(result.status).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe('0 1');
  });
});
