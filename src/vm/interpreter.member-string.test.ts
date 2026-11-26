import { expect, it } from "vitest";
import { run } from "./interpreter";

it("reads the recorded character cells from base and interior struct addresses", () => {
  const r = run(`#include <stdio.h>
#include <string.h>

struct Record { char name[4]; int mark; };

void suffix(char *p)
{
    printf("<%s> %zu\\n", p, strlen(p));
}

int main(void)
{
    struct Record record;
    record.name[0]='A';
    record.name[1]='d';
    record.name[2]='a';
    record.name[3]='\\0';
    record.mark=91;
    printf("<%s> %zu\\n", record.name, strlen(record.name));
    suffix(&record.name[1]);
    return 0;
}
`);
  expect(r.status, r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("<Ada> 3\n<da> 2\n");
  expect(r.trace.steps.at(-1)?.frames[0].variables?.["record.name"].array?.cells).toEqual(["A","d","a","\0"]);
});

const snippet = (body: string) => run(`struct Record { char name[3]; int mark; };
int main(void) { struct Record r; ${body} return 0; }`);
const letters = "r.name[0]='A'; r.name[1]='d'; r.name[2]='a';";

it("honors precision when dumping a char member without a terminator", () => {
  const r = snippet(letters + ' printf("<%.3s> <%.1s> <%.0s>", r.name, &r.name[1], r.name);');
  expect(r.status, r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("<Ada> <d> <>");
});

it("uses the characters actually stored in the trace for strcmp and copying out", () => {
  const r = snippet("r.name[0]='A'; r.name[1]='d'; r.name[2]='\\0';" +
    'char dest[6]; strcpy(dest, r.name); r.name[0]=0; printf("%d %zu %s", strcmp(dest,"Ad"), strlen(r.name), dest);');
  expect(r.status, r.error?.reason).toBe("ok");
  expect(r.trace.steps.at(-1)?.stdout).toBe("0 0 Ad");
  expect(r.trace.steps.find(s => s.frames[0].variables?.["r.name"]?.array?.cells[0] === "A")).toBeDefined();
});

it.each([
  [letters + ' r.mark=0; printf("%s", r.name);', /unterminated string/],
  [letters + ' printf("%.3s", &r.name[1]);', /unterminated string/],
  [`r.name[0]='A'; printf("%zu", strlen(r.name));`, /uninitialized read/],
  ['r.mark=10; printf("%s", &r.mark);', /not inside a struct character array/],
  ['r.name[0]=0; strcpy(r.name,"A");', /cannot write to fixed struct members/],
])("reports invalid or unsupported use: %s", (body, reason) => {
  const r = snippet(body);
  expect(r.status).toBe("error");
  expect(r.error?.reason).toMatch(reason);
});

it("detects an out-of-lifetime struct member after a helper returns", () => {
  const r = run(`struct Record { char name[3]; int mark; };
  char *expired(void) { struct Record r; r.name[0]=0; return r.name; }
  int main(void) { char *p=expired(); printf("%s",p); return 0; }`);
  expect(r.status).toBe("error");
  expect(r.error?.reason).toContain("after its function returned");
});
