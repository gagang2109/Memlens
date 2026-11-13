import { expect, it } from "vitest";
import { run } from "../../src/vm/interpreter";
for (const index of ['[0][2]', '[1][-1]', '[-1][2]', '[2][-1]']) {
 it(`rejects invalid matrix subscript ${index} even if flattened offset fits`, () => {
  const result=run(`int main(){int a[2][2]={{1,2},{3,4}};printf("%d",a${index});}`);
  expect(result.status).toBe('error');
  expect(result.error?.reason).toContain('array index out of bounds');
 });
}
it('preserves valid matrix traversal', () => {
 const result=run(`int main(){int a[2][2]={{1,2},{3,4}};int sum=0;for(int i=0;i<2;i++){for(int j=0;j<2;j++){sum+=a[i][j];}}printf("%d",sum);}`);
 expect(result.status,result.error?.reason).toBe('ok');
 expect(result.trace.steps.at(-1)?.stdout).toBe('10');
});
it('rejects cross-row writes before mutating another element', () => {
 const result=run(`int main(){int a[2][2]={{1,2},{3,4}};a[0][2]=99;}`);
 expect(result.status).toBe('error');
 expect(result.error?.reason).toContain('array index out of bounds');
 expect(result.trace.steps.at(-1)?.frames[0].locals.a).toBe('[1, 2, 3, 4]');
});
it('evaluates each valid subscript only once', () => {
 const result=run(`int main(){int a[2][2]={{1,2},{3,4}};int row=0;int col=1;a[row++][col--]=8;printf("%d %d %d",a[0][1],row,col);}`);
 expect(result.status,result.error?.reason).toBe('ok');
 expect(result.trace.steps.at(-1)?.stdout).toBe('8 1 0');
});
it('allows one-past-row address formation without reading the element', () => {
 const result=run(`int main(){int a[2][2]={{1,2},{3,4}};int i=0;int *p=&a[i++][2];printf("%d %d %d",p==&a[1][0],i,&a[1][2]==&a[1][2]);}`);
 expect(result.status,result.error?.reason).toBe('ok');
 expect(result.trace.steps.at(-1)?.stdout).toBe('1 1 1');
});
it('rejects address formation beyond one-past a row', () => {
 const result=run(`int main(){int a[2][2]={{1,2},{3,4}};int *p=&a[0][3];}`);
 expect(result.status).toBe('error');
 expect(result.error?.reason).toContain('array index out of bounds');
});
