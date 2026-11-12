import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../../src/vm/interpreter";

const directory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const cases = [
  ["01_singly_linked_list.c", "10 20 30 "],
  ["02_doubly_linked_list.c", "1 2"],
  ["03_array_stack.c", "20 10 "],
  ["04_array_queue.c", "7 8 "],
  ["05_bst.c", "1 2 3 4 6 "],
  ["06_sorting.c", "1 2 3 4"],
  ["07_swap.c", "9 3"],
  ["08_recursion.c", "120 13"],
  ["09_strings.c", "5 olleh"],
  ["10_matrix_input.c", "5 9"],
  ["11_tree_menu.c", "10 5 15 \n1\n15 10 \n"],
] as const;

describe("realistic data structures lab programs", () => {
  for (const [file, stdout] of cases) {
    it(`runs ${file}`, () => {
      const source = readFileSync(resolve(directory, file), "utf8");
      const stdin = file === "10_matrix_input.c" ? "4 5" : file === "11_tree_menu.c" ? "10 1 10 5 1 1 10 15 2 2 3 5 4 5 2 0" : "";
      const result = run(source, 100000, 100, stdin);
      expect(result.status, result.error?.reason).toBe("ok");
      expect(result.trace.steps.at(-1)?.stdout).toBe(stdout);
    });
  }
});

describe("tree menu language forms", () => {
  it("supports conditional expressions and sizeof expressions", () => {
    const result = run(`struct Node { int value; struct Node *left; };
int main(void) {
    struct Node *p = NULL;
    int size = sizeof *p;
    int selected = p == NULL ? size : 0;
    printf("%d", selected);
}`);
    expect(result.status, result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe("16");
  });
});
