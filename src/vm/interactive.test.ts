import { describe, expect, it } from "vitest";
import { run } from "./interpreter";
import { InteractiveRun } from "./interactive";
const stdout = (result: ReturnType<typeof run>) => result.trace.steps.at(-1)?.stdout;
describe("interactive simulated stdin", () => {
  it("distinguishes waiting from explicit EOF and ordinary batch EOF", () => {
    const source = 'int main(){int a;printf("number: ");int n=scanf("%d", &a);printf("%d",n);}';
    const session = new InteractiveRun(source);
    expect(session.result.status).toBe("waiting");
    expect(stdout(session.result)).toBe("number: ");
    expect(stdout(session.sendEOF())).toBe("number: -1");
    expect(run(source).status).toBe("ok");
    expect(stdout(run(source))).toBe("number: -1");
  });
  it("replays partial conversions and destination side effects exactly once in fresh state", () => {
    const source = 'int main(){int a[2];int i=0;printf("two: ");scanf("%d%d", &a[i++], &a[i++]);printf("%d %d %d",a[0],a[1],i);}';
    const session = new InteractiveRun(source);
    expect(session.submitLine("3").status).toBe("waiting");
    expect(session.result.trace.steps.at(-1)?.frames.at(-1)?.locals.i).toBe("2");
    const result = session.submitLine("7");
    expect(result.status).toBe("ok"); expect(stdout(result)).toBe("two: 3 7 2");
    expect(result.trace.steps).toEqual(run(source,100000,100,"3\n7\n").trace.steps);
  });
  it("keeps active function frames and allocations while waiting, without exit leaks", () => {
    const session = new InteractiveRun('void read(){int *p=malloc(4);scanf("%d",p);printf("%d",*p);free(p);} int main(){read();}');
    expect(session.result.status).toBe("waiting");
    expect(session.result.trace.steps.at(-1)?.frames.at(-1)?.name).toBe("read");
    expect(session.result.leaks).toEqual([]); expect(session.result.orphanedAtExit).toEqual([]);
    expect(stdout(session.submitLine("5"))).toBe("5");
  });
  it("supports partial assignment followed by EOF", () => {
    const session = new InteractiveRun('int main(){int a;int b;int n=scanf("%d%d",&a,&b);printf("%d %d",n,a);}');
    expect(session.submitLine("4").status).toBe("waiting");
    expect(stdout(session.sendEOF())).toBe("1 4");
  });
  it("treats malformed numeric input as a matching failure, not a request for more", () => {
    const session = new InteractiveRun('int main(){int a;int n=scanf("%d",&a);printf("%d",n);}');
    expect(stdout(session.submitLine("oops"))).toBe("0");
  });
  it("waits for unfinished tokens and respects widths, whitespace and literals", () => {
    const source='int main(){int a;scanf("%d",&a);printf("%d",a);}';
    expect(run(source,100000,100,"12",true).status).toBe("waiting");
    expect(run(source,100000,100,"+",true).status).toBe("waiting");
    expect(run(source.replace('%d",&a','%1d",&a'),100000,100,"+",true).status).toBe("ok");
    expect(run(source.replace('%d",&a','%2d",&a'),100000,100,"12",true).status).toBe("ok");
    const session = new InteractiveRun('int main(){int a;scanf("%d ",&a);printf("%d",a);}');
    expect(session.submitLine("4").status).toBe("waiting");
    expect(stdout(session.submitLine("x"))).toBe("4");
    expect(run('int main(){scanf("X");}',100000,100,"",true).status).toBe("waiting");
  });
  it("supports getchar, blank lines and explicit EOF", () => {
    const session = new InteractiveRun('int main(){int a=getchar();int b=getchar();printf("%d %d",a,b);}');
    expect(session.submitLine("").status).toBe("waiting");
    expect(stdout(session.sendEOF())).toBe("10 -1");
  });
  it("waits for a full character field and supports string widths and suppression", () => {
    const source='int main(){char s[4];scanf("%3c",s);printf("%c%c%c",s[0],s[1],s[2]);}';
    expect(run(source,100000,100,"a",true).status).toBe("waiting");
    expect(stdout(run(source,100000,100,"abc",true))).toBe("abc");
    const session=new InteractiveRun('int main(){char s[4];scanf("%*d %3s",s);printf("%s",s);}');
    expect(stdout(session.submitLine("2 cat"))).toBe("cat");
  });
  it("preserves buffer bounds errors, recursion and step limits", () => {
    const session=new InteractiveRun('int main(){char s[2];scanf("%s",s);}');
    expect(session.submitLine("long").error?.reason).toContain("bounds");
    expect(run('int main(){while(1){}}',20,100,"",true).error?.reason).toContain("step limit");
    expect(run('void f(){f();} int main(){f();}',100,5,"",true).error?.reason).toContain("stack overflow");
  });
  it("never sends input by replay navigation and rejects submissions after completion", () => {
    const session=new InteractiveRun('int main(){int a;scanf("%d",&a);printf("%d",a);}');
    session.submitLine("5"); const trace=session.result.trace;
    trace.goto(0); trace.goto(trace.steps.length-1);
    expect(session.transcript).toBe("5\n"); expect(stdout(session.result)).toBe("5");
    expect(()=>session.submitLine("6")).toThrow("not waiting");
  });
  it("bounds input and number of replays without mutating the previous waiting run", () => {
    const session=new InteractiveRun('int main(){int x;while(1){scanf("%d",&x);}}');
    expect(()=>session.submitLine("1".repeat(65536))).toThrow("64 KiB");
    expect(session.transcript).toBe("");
    for(let i=0;i<100;i++) expect(session.submitLine("1").status).toBe("waiting");
    expect(()=>session.submitLine("1")).toThrow("budget");
  });
});
