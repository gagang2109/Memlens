import { describe, expect, it } from "vitest";
import { run } from "./interpreter";

describe("data structures lab language extensions", () => {
  it("supports casts and struct keyword declarations", () => {
    const result = run(`#include <stdlib.h>
struct node { int value; struct node *next; };
int main() { struct node *p = (struct node *)malloc(sizeof(struct node)); p->value = 7; p->next = NULL; }`);
    expect(result.status).toBe("ok");
  });

  it("supports stack arrays, initializers, array parameters, and bounds errors", () => {
    const result = run(`int sum(int values[], int n) { int total = 0; for (int i = 0; i < n; i++) total += values[i]; return total; }
int main() { int values[3] = {1, 2, 3}; printf("%d", sum(values, 3)); }`);
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("6");
    const bounds = run(`int main() { int values[2]; values[2] = 4; }`);
    expect(bounds.status).toBe("error");
    expect(bounds.error?.reason).toContain("out of bounds");
  });

  it("supports break, continue, do while, and switch", () => {
    const result = run(`int main() { int i = 0; int total = 0; do { i++; if (i == 2) continue; total += i; if (i == 4) break; } while (i < 6); switch (total) { case 8: printf("ok"); break; default: printf("bad"); } }`);
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("ok");
  });

  it("supports pointer arithmetic and bounds checking", () => {
    const result = run(`int main() { int *p = (int *)malloc(3 * sizeof(int)); p[0] = 4; p[1] = 5; p++; printf("%d", p[0]); }`);
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("5");
    const bounds = run(`int main() { int *p = (int *)malloc(2 * sizeof(int)); p[2] = 1; }`);
    expect(bounds.status).toBe("error");
    expect(bounds.error?.reason).toContain("out of bounds");
  });

  it("supports allocation, string, memory, scanf, and define builtins", () => {
    const result = run(`#define N 3
int main() { char text[9] = "hi"; char other[8] = " there"; strcat(text, other); printf("%d", strlen(text)); int n; scanf("%d", &n); printf("%d", n); }`, 100000, 100, "42");
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("842");
  });

  it("supports calloc, realloc, strcmp, memset, and character/string scanf", () => {
    const result = run(`int main() {
      char *text = (char *)calloc(1, 8);
      char source[8] = "abc";
      strcpy(text, source);
      memset(text, 120, 1);
      text = (char *)realloc(text, 16);
      printf("%d%d", strcmp(text, source), strlen(text));
      char letter; char word[8]; scanf("%c", &letter); scanf("%s", word); printf("%c%s", letter, word);
    }`, 100000, 100, "Z hello");
    expect(result.status).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toContain("Zhello");
  });

  it("returns friendly line-numbered errors for unsupported constructs", () => {
    const result = run(`int main() { switch (1) { case 1: break; } }`);
    expect(result.status).toBe("ok");
    const unsupported = run(`int main() { function_pointer(); }`);
    expect(unsupported.status).toBe("error");
    expect(unsupported.error?.reason).toContain("line");
  });
});
