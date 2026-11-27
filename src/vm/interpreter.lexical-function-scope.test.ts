import { expect, it } from "vitest";
import { run } from "./interpreter";

it("looks up an unqualified graph head at file scope and continues to accept a caller array by address", () => {
  const result = run(`
struct Edge { int to; struct Edge *next; };
struct Edge *head[2] = {NULL};
struct Edge *make(int to) {
  struct Edge *edge = malloc(16);
  edge->to = to;
  edge->next = NULL;
  return edge;
}
void build(void) { head[0] = make(2); }
void passed(struct Edge **out) { out[1] = make(3); }
int main(void) {
  struct Edge *head[2] = {NULL};
  build();
  passed(head);
  printf("%d %d", head[0] == NULL, head[1]->to);
  free(head[1]);
  head[1] = NULL;
  return 0;
}
`);
  expect(result.status, result.error?.reason).toBe("ok");
  const built = result.trace.steps.find(step => step.stdout === "1 3")!;
  const global = built.frames.find(frame => frame.name === "file scope")!;
  const main = built.frames.find(frame => frame.name === "main")!;
  const [globalNode, localNode] = built.memory.allocations;
  expect(global.variables?.head.array?.cells[0]).toBe(globalNode.address);
  expect(main.variables?.head.array?.cells).toEqual([null, localNode.address]);
  expect(global.variables?.head.array?.base).not.toBe(main.variables?.head.array?.base);
  expect(result.orphanedAtExit).toEqual([]);
  expect(result.leaks.map(leak => leak.address)).toEqual([globalNode.address]);
  expect(result.trace.goto(built.index)?.frames).toEqual(built.frames);
});

it("does not read a caller's local or use it through sizeof", () => {
  for (const expression of ["secret", "sizeof secret"]) {
    const result = run("int read(void) { return " + expression + "; } int main(void) { int secret = 41; read(); return 0; }");
    expect(result.status).toBe("error");
    expect(result.error?.reason).toContain("secret");
    expect(result.trace.steps.at(-1)?.frames.map(frame => frame.name)).toEqual(["main", "read"]);
  }
});

it("keeps recursion's own locals while looking up a separate file-scope scalar", () => {
  const result = run(`
int scale = 7;
int score(int n) {
  if (n == 0) return scale;
  int value = n;
  return score(n - 1) + value;
}
int main(void) {
  int scale = 100;
  printf("%d %d", score(3), scale);
  return 0;
}
`);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("13 100");
});
