import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
describe('allocation failure source locations', () => {
  it.each(['malloc(40000)', 'calloc(10000,4)', 'realloc(0,40000)'])('reports %s on the allocation call line', call => {
    const result = run(`int main(){\nint marker=1;\nchar *p=${call};\nprintf("continued");}`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toBe('out of simulated memory');
    expect(result.error?.line).toBe(3);
    expect(result.trace.steps.at(-1)?.line).toBe(3);
  });
});
it('retains helper frame and source line on allocation exhaustion', () => {
  const result = run('char *make(){\nint size=40000;\nreturn malloc(size);\n}\nint main(){char *p=make();}');
  expect(result.status).toBe('error');
  expect(result.error?.line).toBe(3);
  expect(result.trace.steps.at(-1)?.frames.at(-1)?.name).toBe('make');
  expect(result.trace.steps.at(-1)?.frames.at(-1)?.locals.size).toBe('40000');
});
it('does not free or alter the existing allocation when realloc fails', () => {
  const result = run('int main(){\nchar *p=malloc(4);\np[0]=65;\np=realloc(p,40000);\n}');
  expect(result.status).toBe('error');
  expect(result.error?.line).toBe(4);
  const snapshot = result.trace.steps.at(-1)!.memory;
  expect(snapshot.allocations).toHaveLength(1);
  expect(snapshot.allocations[0].freeStep).toBeUndefined();
  expect(snapshot.bytes[snapshot.allocations[0].address]).toBe(65);
});
