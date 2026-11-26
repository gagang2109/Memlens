import { describe, expect, it } from 'vitest';
import { run } from './interpreter';
const check = (body: string, expected: string) => {
  const result = run(`int main(){${body}return 0;}`);
  expect(result.status, result.error?.reason).toBe('ok');
  expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
};
describe('printf formatting', () => {
  it('normalizes negative integer zero', () => check(`int x=-0;printf("[%d][%+d][%.0d]",x,x,x);`, '[0][+0][]'));
  it.each(['%u %d', '%zd', '%*d', '%', '%q'])('rejects unsupported conversion %s', (format) => {
    const result=run(`int main(){printf("${format}",2,7);}`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toContain('unsupported or incomplete printf conversion');
  });
  it('preserves numeric and character %c', () => check(`printf("%c %c",65,'B');`, 'A B'));
  it('pads and truncates strings', () => check(`printf("[%5.2s][%-5.2s]","hello","hello");`, '[   he][he   ]'));
  it('applies signed zero padding and integer precision', () => check(`printf("[%04d][%+05d][%5.3d][%05.3d]",-7,7,7,7);`, '[-007][+0007][  007][  007]'));
  it('supports zero precision and left alignment', () => check(`printf("[%.0d][%-04d][% d]",0,7,7);`, '[][7   ][ 7]'));
  it('pads float output and accepts explicit zero precision', () => check(`printf("[%07.2f][%-7.1f][%.0f]",-1.25,1.26,2.0);`, '[-001.25][1.3    ][2]'));
  it('returns number printed including percent and padding', () => check(`int n=printf("[%4s]%%","hi");printf("=%d",n);`, '[  hi]%=7'));
  it('counts UTF-8 literal output and byte characters', () => check(`int n=printf("é%c",128);printf("=%d",n);`, 'é'+String.fromCharCode(128)+'=3'));
  it.each(['%.10001d', '%.101f'])('rejects excessive precision %s', (format) => {
    const result=run(`int main(){printf("${format}",1);}`);
    expect(result.status).toBe('error');
    expect(result.error?.reason).toContain('simulator limit');
  });
  it('returns zero for an empty format', () => check(`int n=printf("");printf("%d",n);`, '0'));
  it('reads a local character-array format', () => check(`char f[3]="%d";printf(f,7);`, '7'));
  it('rejects excessive widths rather than allocating them', () => {
    const result=run(`int main(){printf("%999999999d",1);}`);
    expect(result.status).toBe('error'); expect(result.error?.reason).toContain('simulator limit');
  });
});


describe("printf %zu for byte sizes", () => {
  it("prints a fixed matrix and its rows without consuming later arguments", () =>
    check('int a[2][3]; int n=printf("%zu/%zu/%d%%",sizeof a,sizeof a[0],7);printf("=%d",n);','24/12/7%=8'));
  it("prints the runtime array size and handles width, alignment and precision", () => {
    const result=run(`#include <stdio.h>
int main(void) {
  int n; scanf("%d",&n);
  int a[n];
  printf("[%zu][%06zu][%06.4zu][%-6zu][%.0zu]",sizeof a,sizeof a,sizeof a,sizeof a,sizeof a-sizeof a);
}`,100000,100,"3");
    expect(result.status,result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("[12][000012][  0012][12    ][]");
  });
  it.each(["-1", "1.5", "9007199254740992", '"12"'])("diagnoses unsupported %%zu values: %s", value => {
    const result=run(`int main(){printf("%zu",${value});}`);
    expect(result.error?.reason).toContain("nonnegative integer");
  });
  it("keeps the existing formatting limit", () => {
    const result=run('int main(){printf("%10001zu",sizeof(int));}');
    expect(result.error?.reason).toContain("simulator limit");
  });
});
