import { describe, expect, it } from "vitest";
import { run } from "./interpreter";
const cases = [
  ["sign-only matching failure consumes prefix", 'int n=9; char c; int r=scanf("%d",&n); scanf("%c",&c); printf("%d %d %c",r,n,c);', '+x', '0 9 x'],
  ["mixed conversions", 'int n=0; char c; int r=scanf("%d %c",&n,&c); printf("%d %c %d",n,c,r);', '42 A', '42 A 2'],
  ["EOF preserves destination", 'int n=7; int r=scanf("%d",&n); printf("%d %d",r,n);', '', '-1 7'],
  ["matching failure preserves destination", 'int n=7; int r=scanf("%d",&n); printf("%d %d",r,n);', 'no', '0 7'],
  ["partial EOF returns assigned count", 'int a=7; int b=8; int r=scanf("%d%d",&a,&b); printf("%d %d %d",r,a,b);', '42', '1 42 8'],
  ["short string terminates", 'char s[10]="longer"; scanf("%s",s); printf("%s",s);', 'hi', 'hi'],
  ["character consumes one byte without whitespace skipping", 'char a; char b; scanf("%c%c",&a,&b); printf("[%c][%c]",a,b);', ' A', '[ ][A]'],
  ["integer leaves following character", 'int n; char c; scanf("%d%c",&n,&c); printf("%d %c",n,c);', '42A', '42 A'],
  ["literals and escaped percent", 'int n; int r=scanf("value=%d%%",&n); printf("%d %d",n,r);', 'value=42%', '42 1'],
  ["field width preserves remaining input", 'char a[4]; char b[4]; scanf("%3s%3s",a,b); printf("%s %s",a,b);', 'abcdef', 'abc def'],
  ["suppressed conversion", 'int n; int r=scanf("%*d%d",&n); printf("%d %d",n,r);', '4 9', '9 1'],
  ["heap string", 'char *s=calloc(8,1); scanf("%7s",s); printf("%s",s); free(s);', 'hello', 'hello'],
  ["indexed numeric target", 'int a[2]={1,2}; scanf("%d",&a[1]); printf("%d %d",a[0],a[1]);', '9', '1 9'],
] as const;
describe("scanf conversion semantics", () => {
  it.each(cases)("%s", (_name, body, input, expected) => {
    const result = run(`int main(){${body} return 0;}`, 100000, 100, input);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
  });
});

it("rejects writing through a freed struct-field pointer", () => {
  const result = run(`struct N { int value; }; int main(){
    struct N *n=malloc(sizeof(struct N)); int *p=&n->value;
    free(n); scanf("%d",p); }`, 100000, 100, "9");
  expect(result.status).toBe("error");
  expect(result.error?.reason).toBe("use-after-free");
});
