<p align="center">
  <img src="public/memlens-mark.svg" alt="Memlens memory lens logo" width="80" height="80">
</p>

<h1 align="center">Memlens</h1>
<p align="center"><strong>Step through your C code. See the pointers. Rewind the mistake.</strong></p>

**Main demo:** [memlensc.vercel.app](https://memlensc.vercel.app)  
**Alternate demo:** [memlens-six.vercel.app](https://memlens-six.vercel.app)

Memlens is a browser-based learning tool for C data structures and memory. Edit a program, run it, then explore its recorded execution one change at a time: stack frames, heap allocations, pointer arrows, and memory errors.

> **A teaching tool, not a full C compiler.** Memlens interprets a supported subset of C using simulated memory. It does not compile or execute native C, and its diagnostics can differ from gcc/clang or real hardware.

[Quick start](#try-it-in-a-minute) · [What you can explore](#what-you-can-explore) · [Controls](#controls) · [C support](#supported-c-subset) · [Run locally](#run-locally)

## See memory, not just output

![Memlens showing C source beside a linked list, stack variables, and pointer arrows](docs/screenshot-list.jpg)

*The list example at step 29: source, active stack frames, four allocated nodes, and the reversible timeline. Later, this sample deliberately accesses a freed node so you can trace how the bug happens.*

## Try it in a minute

1. Open the [main demo](https://memlensc.vercel.app) and choose a sample, or edit the C source.
2. If your program uses `scanf`, enter its values in **Program input**.
3. Click **Run** to record execution.
4. Step forward and backward. Watch the current explanation, console, call stack, and heap change together.
5. Zoom or pan the memory view to follow pointers. When an error appears, step backward to find what caused it.

## What you can explore

| Learn by doing | What Memlens shows |
| --- | --- |
| **Follow pointers** | Linked-list and binary-tree layouts, heap addresses, pointer arrows, and NULL targets. |
| **Understand execution** | Reversible steps, a timeline, call frames, console output, and playback speeds from 0.5× to 4×. |
| **Investigate memory bugs** | Diagnostics for invalid memory operations, freed-block markers, and reports of leaked or orphaned allocations. |
| **Practice data structures** | Bundled list, tree, stack, queue, recursion, and memory-error examples. |
| **Predict the next state** | Pointer-target questions with a locally saved score and streak. |
| **Write code here** | CodeMirror syntax highlighting, bracket matching, find/replace, undo/redo, and familiar editing shortcuts. |

<details>
<summary><strong>Explore a binary search tree</strong></summary>

![Binary search tree with all five nodes, root pointers, source code, and traversal output](docs/screenshot-tree.jpg)

The bundled BST sample during inorder traversal, with the diagram zoomed out to show every node. The amber warning is a whole-run summary: this sample does not free its five allocations before exit, even while you inspect an earlier step.

</details>

## Controls

| Where | Shortcut or control | Action |
| --- | --- | --- |
| Editor | Ctrl / ⌘ + `/` | Toggle comments on selected lines |
| Editor | Ctrl / ⌘ + `F` | Find and replace |
| Editor | Ctrl / ⌘ + `Z` / Ctrl / ⌘ + Shift + `Z` | Undo / redo |
| Editor | **Keyboard shortcuts** button | Open the full editing guide |
| Playback | `←` / `→` | Step backward / forward |
| Playback | `Space` | Play / pause |
| Playback | `Home` / `End` | Jump to the first / last step |
| Memory view | `−` / `+`, **Fit width**, **Reset view** | Adjust the diagram from 25% to 300% zoom |
| Memory view | Drag empty space, scroll, or swipe | Move around the diagram |

Playback shortcuts stay out of the editor and interactive controls. **Tab** moves focus between controls rather than trapping it inside the editor.

## Practice without `main`

Choose **Array sum snippet — no main needed**, or write supported C statements directly:

```c
int values[] = {4, 7, 2};
int total = 0;
for (int i = 0; i < 3; i++) total += values[i];
printf("%d", total);
```

Memlens executes top-level statements in source order without adding hidden wrapper lines. Define the variables and data your snippet needs. Function definitions can accompany a snippet, but you must call them explicitly with your chosen arguments; Memlens does not invent test data or auto-call functions. A bare expression does not automatically print its value: use `printf`.

This is a teaching extension, not standard standalone C syntax: native C programs normally need an entry point such as `main`. Existing full programs continue to work. If you mix top-level statements with a `main` function, those statements run before `main`.

## Supported C subset

Designed for small C and data-structures exercises: functions and recursion, structs and pointers, fixed-size arrays (including two-dimensional arrays), loops, branching, and a selection of memory and input/output functions.

<details>
<summary><strong>Expand the language and library support reference</strong></summary>

The interpreter currently supports:

- Integer, character, `short`, `long`, `long long`, `unsigned`, `float`, `double`, `void`, `struct`, and typedef-defined struct names, with `struct Node *p` declarations.
- `const` and `static` qualifiers, multiple declarators, function prototypes, and the common `main` signatures.
- Pointer declarations, casts, pointer arithmetic, dereference, address-of, indexing, and pointer values.
- Pointer-to-pointer parameters and address-of expressions for variables, fields, and indexed elements.
- Struct declarations with fields, including pointer fields such as `next`, `left`, and `right`.
- Fixed-size `int` and `char` arrays, array initializers, array indexing, array parameters, two-dimensional arrays, and arrays of struct values.
- Struct values, the `.` operator, and passing struct addresses to functions.
- Variables, assignments (including chained assignment), compound assignments (`+=`, `-=`), arithmetic, comparisons, logical operators, the conditional operator (`?:`), unary `!`, unary `-`, dereference (`*`), address-of (`&`), and increment/decrement.
- Integer, character, string, and `NULL` literals. Quoted literals decode escaped quotes/backslashes, standard simple escapes (such as `\n`, `\t`, and `\0`), and octal/hexadecimal escapes in the byte range 0–255. Multi-character character literals, universal character escapes, and line-spliced literals are not modeled; malformed or unsupported escapes report a parse error.
- `if`/`else`, `while`, `do`/`while`, `for`, `break`, `continue`, and `switch`/`case`/`default`.
- User-defined functions, parameters, return values, and recursion.
- `malloc`, `calloc`, `realloc`, `free`, limited `sizeof` type/pointee forms (see limits below), `strlen`, `strcpy`, `strcmp`, `strcat`, `memset`, `getchar`, `exit`, and `printf` with `%d`, `%c`, `%s`, `%p`, `%f`, `%lf`, width, precision, and `%%`.
- Printf formatting supports literal widths, left alignment, numeric signs/zero padding, integer/string precision, and floating precision up to 100. Width and other precision values are capped at 10,000 to bound browser allocations. Return counts include padding and `%c` bytes. String formatting is intended for basic ASCII teaching examples; non-ASCII string precision, locale-dependent formatting, exact native floating-point tie rounding, dynamic `*` widths, and other conversion specifiers are not modeled. Unsupported or incomplete conversions produce a simulator error rather than silently misaligning arguments.
- `getchar` returns `EOF` (`-1`) once input is exhausted and shares the input position with `scanf`. Non-EOF character values retain the simulator’s existing string-backed representation, so comparisons with numeric character codes (for example, `getchar() == 65`) are not fully C-compatible. This is not a full C byte-stream/encoding implementation.
- `scanf` for `%d`, `%c`, and `%s` using the app's standard-input field, including repeated whitespace-separated input and indexed lvalue targets.
- Numeric and string `#define` constants. `#include` lines are accepted and ignored.
- `//` and `/* ... */` comments.

It does not currently support:

- Variable-length arrays and array features beyond the supported fixed-size scalar, struct, and two-dimensional arrays.
- Function pointers, unions, variadic functions, general pointer arithmetic beyond supported element indexing, and preprocessor directives other than numeric/string `#define` and ignored `#include`.
- The full C standard library or compilation with gcc/clang.

</details>

### Important limits

- Each local array is limited to **65,536 simulated bytes** (for example, 65,536 `char` elements or 16,384 `int` elements). Every dimension must be a positive integer, and multidimensional totals count toward the same cap. Reduce the array dimensions if this limit is reported; validation occurs before allocating array storage to keep accidental oversized inputs from freezing the browser. A one-dimensional omitted bound (`int a[] = {1,2}` or `char text[] = "abc"`) is inferred from its initializer. Other omitted-bound forms need explicit dimensions. This per-array guard is not a total memory budget and does not promise general variable-length-array support.

- This is a **subset interpreter**, not a standards-complete C implementation. Unsupported syntax or library calls may need a simpler equivalent.
- Variable-length arrays, function pointers, unions, and the full C preprocessor/library are not supported.
- Addresses and object sizes are simulated; the app is not a substitute for a native debugger or sanitizer.
- `sizeof` is not a general expression/type-size implementation. Basic forms such as `sizeof(int)`, `sizeof(char)`, and `sizeof(*p)` for a simple typed pointer use simulated sizes, but array, variable, and numeric-expression operands can return incorrect sizes without an error. Do not use `sizeof(array) / sizeof(array[0])` to derive loop bounds here; use an explicit element count until this limitation is resolved.
- Local-array `memset` supports byte ranges in `char` arrays and zero-filling whole `int` elements. Partial-byte or nonzero fills of local integer arrays, and other local object representations, report an unsupported-operation error rather than guessing a machine layout.
- Diagram layouts infer structure from pointer fields and heap edges. Not every possible graph has a specialized layout.
- Predict skips local-pointer questions when recursive calls share the same function name: the current trace labels cannot uniquely identify those frames. Stepping and playback still continue normally.
- Source and Predict progress use browser localStorage, not an account or cloud sync. Browser storage can be cleared or unavailable.
- The production JavaScript bundle includes CodeMirror and currently triggers Vite's large-chunk warning.

## Run locally

Requires **Node.js compatible with Vite 6** and npm. Clone the repository, then run:

```sh
git clone https://github.com/gagang2109/Memlens.git
cd Memlens
npm ci
npm run dev
```

Open the local URL printed by Vite, usually [http://localhost:5173](http://localhost:5173).

On Windows PowerShell, use `npm.cmd` in place of `npm` if your execution policy blocks `npm.ps1`.

### Check a change

Run all three checks below before pushing a change; a successful build does not replace the test suite.

```sh
npm test
npm run typecheck
npm run build
```

- **Tests:** Vitest regression tests, including C lab fixtures in [`tests/labs`](tests/labs).
- **Typecheck:** TypeScript checks without emitting files.
- **Build:** Type-checks and creates the production site in `dist/`.

For Vercel, use the **Vite** preset, repository root `./`, build command `npm run build`, and output directory `dist`. The app has no backend, database, or server-side C execution.

## Under the hood

```text
C source → lexer/parser → interpreter + simulated memory → recorded trace → React visualizer
```

| Location | Responsibility |
| --- | --- |
| [`src/lang`](src/lang) | Lexer and parser for the supported C subset |
| [`src/vm`](src/vm) | Memory model, interpreter, trace data, and prediction logic |
| [`src/viz`](src/viz) | Heap reachability, structure detection, and layouts |
| [`src/ui`](src/ui) | Editor, explanations, diagrams, playback, and styles |
| [`src/samples.ts`](src/samples.ts) | Bundled sample programs |
| [`tests/labs`](tests/labs) | C exercises and regression coverage |

The byte-addressable memory model tracks initialized, uninitialized, and freed memory. Recorded steps retain the state needed to revisit stack frames, heap fields, output, and pointer relationships without executing native code.

## Found an example that behaves incorrectly?

[Open an issue](https://github.com/gagang2109/Memlens/issues) with the smallest C program that reproduces it, any program input, the expected result, and what Memlens actually shows. Mention your browser and include a screenshot when the problem is visual. Remove personal data before sharing.

## Possible future directions

Function pointers, unions, a bit-level memory view, shareable links, and image/GIF export are ideas for future work, **not current features**.

## License

[MIT](LICENSE) · Copyright © 2026 Gagan Ganesh Devadiga

### Practice a function with explicit test data

`main()` is optional for supported snippets. Put your types, helper functions and function in the source editor, then open **Test setup & call** to create inputs and call it. The setup is appended after the source; trace and diagnostic labels distinguish source lines from test-setup lines. No function or arguments are guessed. Use `printf` when you want to display a result. Clear setup before running a complete program with `main()`. Both editor drafts are saved separately in this browser when storage is available.

Choose **Practice tree height — separate test setup** for an editable two-node tree example. Its height convention counts nodes (empty tree 0, leaf 1). Selecting any sample explicitly replaces the source and setup; copy your draft before replacing it. The runner still supports only Memlens's documented C subset, not arbitrary missing types, libraries or function signatures.

### Start a data-structure exercise

The **Start from a scaffold** control directly above the source editor is separate from the completed examples in **Samples**. Choose binary tree, singly linked list, stack, queue, graph (adjacency matrix), or a basic function. Each starter provides editable definitions/helpers, explicit hardcoded input and `main()`, with comments showing where to add and call your own algorithm. Nothing executes automatically.

Choosing a category does not alter your draft. **Use starter** asks before replacing source and clearing the optional test setup; **Cancel** leaves both intact. **Restore previous draft** recovers the source/setup pair replaced by the most recent starter during this session (until reload or another starter). Copy important work before replacing it. The graph starter uses a flat adjacency matrix visible as array cells, not a dedicated node-link graph layout. All starters use Memlens's supported subset; they do not infer arbitrary types or function signatures.
