import { expect, it } from "vitest";
import { run } from "./interpreter";

it("runs both branches of a stack-based palindrome lab with literal and local-buffer arguments", () => {
  const result = run(`struct Stack { char items[8]; int top; };
void push(struct Stack *s, char c) { s->items[++s->top] = c; }
char pop(struct Stack *s) { return s->items[s->top--]; }
int palindrome(const char *text) {
  struct Stack s;
  s.top = -1;
  int i = 0;
  while (text[i]) push(&s, text[i++]);
  for (i = 0; text[i]; i++) if (text[i] != pop(&s)) return 0;
  return 1;
}
int main(void) {
  char copy[8] = "level";
  printf("%d ", palindrome("level"));
  printf("%d ", palindrome("heap"));
  copy[0] = 't';
  printf("%d", palindrome(copy));
  return 0;
}`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("1 0 0");
  const at = result.trace.steps.findIndex(step =>
    step.frames[1]?.variables?.["s.items"]?.array?.cells.slice(0, 3).join("") === "lev"
  );
  expect(at).toBeGreaterThan(0);
  expect(result.trace.goto(at)?.frames[1].variables?.["s.items"].array?.cells.slice(0, 3)).toEqual(["l", "e", "v"]);
  expect(result.trace.goto(at - 1)?.frames[1].variables?.["s.items"].array?.cells.slice(0, 3)).toEqual(["l", "e", null]);
});

it("reads embedded and implicit NUL, direct literals, escaped bytes, and one evaluated subscript", () => {
  const defined = run(String.raw`int main(void) {
    const char *p = "a\0b\x21";
    int i = 2;
    char c = p[i++];
    printf("%c %c %d %d %d %c", c, p[i], i, p[1], p[4], "xy"[1]);
    return 0;
  }`);
  expect(defined.status, defined.error?.reason).toBe("ok");
  expect(defined.trace.steps.at(-1)?.stdout).toBe("b ! 3 0 0 y");
});

it.each([
  ["p[-1]", "index out of bounds", undefined],
  ["p[5]", "index out of bounds", undefined],
  ["p[1.0]", "subscript must be an integer", "invalid-c"],
  ["&p[0]", "addresses of individual string-literal bytes are not modeled", "unsupported-c"],
  ['"é"[0]', "non-ASCII bytes is not modeled", "unsupported-c"],
])("diagnoses %s on its source line", (expr, reason, kind) => {
  const r = run(`int main(void) {
    const char *p = "text";
    printf("%d", ${expr});
    return 0;
  }`);
  expect(r.error?.line).toBe(3);
  expect(r.error?.reason).toContain(reason);
  expect(r.error?.diagnosticKind).toBe(kind);
});

it("keeps a numeric-looking literal separate from writable storage", () => {
  const r = run(`int main(void) {
    char *heap = malloc(2);
    heap[0] = 'x';
    char *p = "4096";
    printf("%c %c ", p[0], heap[0]);
    p[0] = 'y';
    return 0;
  }`);
  expect(r.error?.reason).toContain("cannot modify a read-only string literal");
  expect(r.trace.steps.at(-1)?.stdout).toBe("4 x ");
  expect(r.trace.steps.at(-1)?.memory.bytes[4096]).toBe(120);
});
