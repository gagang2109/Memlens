import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
describe('fixed-arity builtin diagnostics', () => {
  it.each(['malloc()', 'calloc(2)', 'realloc(0)', 'free()', 'strlen()', 'strcpy(0)', 'strcat(0)', 'strcmp(0)', 'memset(0,0)', 'getchar(1)', 'exit()'])('diagnoses %s on its call line', call => {
    const result = run(`int main(){\n${call};\n}`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toContain('arguments, received');
    expect(result.error?.line).toBe(2);
  });
});
it.each(['malloc(1,2)', 'calloc(1,2,3)', 'free(0,2)', 'strlen("a",2)', 'strcmp("a","b",3)', 'memset(0,0,0,4)'])('rejects extra builtin arguments in %s', call => {
  const result = run(`int main(){${call};}`);
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('arguments, received');
});
it('does not evaluate arguments of an invalid builtin call', () => {
  const result = run('int main(){malloc(printf("side effect"),2);}');
  expect(result.status).toBe('error');
  expect(result.trace.steps.at(-1)?.stdout).toBe('');
});
it('diagnoses missing scanf format on its call line', () => {
  const result = run('int main(){\nscanf();\n}');
  expect(result.status).toBe('error');
  expect(result.error?.reason).toBe('missing scanf format argument');
  expect(result.error?.line).toBe(2);
});
