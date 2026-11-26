import { expect, it } from "vitest";
import { InteractiveRun } from "./interactive";
import { run } from "./interpreter";

const source = (format = String.raw`%7[^\n]`) => `#include <stdio.h>
#include <string.h>
int main(void) {
  char expr[8] = "!";
  int result = scanf("${format}", expr);
  printf("result=%d value=<%s> length=%zu\\n", result, expr, strlen(expr));
  int next = getchar();
  if (next == '\\n') printf("next=NEWLINE\\n");
  else if (next == -1) printf("next=EOF\\n");
  else printf("next=<%c>\\n", next);
  return 0;
}`;

const stdout = (r: ReturnType<typeof run>) => {
  expect(r.status, r.error?.reason).toBe("ok");
  return r.trace.steps.at(-1)?.stdout;
};

it.each([
  ["( a )\n", String.raw`%7[^\n]`, "result=1 value=<( a )> length=5\nnext=NEWLINE\n"],
  ["( a )\n", String.raw`%4[^\n]`, "result=1 value=<( a > length=4\nnext=<)>\n"],
  ["\n", String.raw`%7[^\n]`, "result=0 value=<!> length=1\nnext=NEWLINE\n"],
  ["", String.raw`%7[^\n]`, "result=-1 value=<!> length=1\nnext=EOF\n"],
  ["  a\n", String.raw`%7[^\n]`, "result=1 value=<  a> length=3\nnext=NEWLINE\n"],
  ["  a\n", String.raw` %7[^\n]`, "result=1 value=<a> length=1\nnext=NEWLINE\n"],
])("matches native C for input %j with %j", (input, format, output) => {
  expect(stdout(run(source(format), undefined, undefined, input))).toBe(output);
});

it("records the actual terminating NUL and matches input-ahead with interactive replay", () => {
  const ahead = run(source(), undefined, undefined, "( a )\n");
  const session = new InteractiveRun(source());
  expect(session.result.status).toBe("waiting");
  const interactive = session.submitLine("( a )");
  expect(stdout(interactive)).toBe(stdout(ahead));
  for (const r of [ahead, interactive]) {
    const cells = r.trace.steps.at(-1)?.frames[0].variables?.expr.array?.cells;
    expect(cells?.slice(0, 6)).toEqual(["(", " ", "a", " ", ")", "\0"]);
  }
  const empty = new InteractiveRun(source());
  expect(stdout(empty.submitLine(""))).toContain("result=0");
  const eof = new InteractiveRun(source());
  expect(stdout(eof.sendEOF())).toContain("result=-1");
});

it("accepts literal closing brackets, ascending ranges, suppression and following conversions", () => {
  const code = 'int main(void){char a[5];int n;int k=scanf("%4[]a-c]%*[,]%d",a,&n);printf("%d %s %d",k,a,n);}';
  expect(stdout(run(code, undefined, undefined, "]abc,14"))).toBe("2 ]abc 14");
});

it("matches a leading or trailing hyphen literally", () => {
  expect(stdout(run(source("%7[-a]"), undefined, undefined, "-aa!"))).toContain("value=<-aa>");
  expect(stdout(run(source("%7[a-]"), undefined, undefined, "a--!"))).toContain("value=<a-->");
});

it.each(["%", "%[a", "%[]", "%[z-a]", "%0[a]"])("rejects malformed conversion %s", format => {
  const r = run(source(format), undefined, undefined, "aaaa");
  expect(r.status).toBe("error");
  expect(r.error?.reason).toMatch(/scanf/);
});

it.each([
  ["char a[3]=\"xy\";char b[4]=\"bbb\";scanf(\"%3[abc]\",a);", "local array bounds"],
  ["char a[4]=\"xyz\";scanf(\"%3[abc]\",&a[1]);", "local array bounds"],
  ["char *a=malloc(3);scanf(\"%3[abc]\",a);", "heap allocation bounds"],
  ["char a;scanf(\"%3[abc]\",&a);", "requires a character buffer"],
  ["int a[8];scanf(\"%3[abc]\",a);", "requires a writable"],
  ["const char a[8]=\"x\";scanf(\"%3[abc]\",a);", "requires a writable"],
  ["char a[2][4];scanf(\"%3[abc]\",a);", "requires a writable"],
])("rejects writing a scanset outside a writable character buffer: %s", (body, reason) => {
  const r = run(`int main(void){${body}}`, undefined, undefined, "abc");
  expect(r.status).toBe("error");
  expect(r.error?.reason).toContain(reason);
  if (body.includes('char b')) {
    const v = r.trace.steps.at(-1)?.frames[0].variables;
    expect(v?.a.array?.cells).toEqual(["x", "y", "\0"]);
    expect(v?.b.array?.cells).toEqual(["b", "b", "b", "\0"]);
  }
});


it("writes a complete, bounded scanset into a heap buffer", () => {
  const code = 'int main(void){char *a=malloc(4);scanf("%3[abc]",a);printf("%s",a);free(a);}';
  expect(stdout(run(code, undefined, undefined, "abc"))).toBe("abc");
});

it("does not reopen a buffer after its owner returns", () => {
  const code = 'char *old(void){char a[8]; return a;} int main(void){char *p=old();scanf("%3[abc]",p);}';
  const r = run(code, undefined, undefined, "abc");
  expect(r.status).toBe("error");
  expect(r.error?.reason).toContain("outside its lifetime");
});
