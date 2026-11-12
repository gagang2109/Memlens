# Memlens

Memlens is a local-first teaching debugger for a small, executable subset of C.

> Step through your C code and watch memory rewind.

## Why it exists

Pointers and memory bugs are invisible in ordinary C source. Memlens makes them visible by showing execution as a reversible trace with stack values, heap objects, pointer relationships, freed blocks, and memory errors.

## Features

- Editable C source editor powered by CodeMirror 6.
- Reversible stepping and a timeline with alloc, free, call, return, and error event ticks.
- Play/pause playback with 0.5x, 1x, 2x, and 4x speeds.
- Keyboard shortcuts: Left/Right step, Space play/pause, Home jump to the beginning, End jump to the end.
- Stack and heap memory canvas with hexadecimal pointer addresses.
- Linked-list and binary-tree layouts with pointer arrows and NULL stubs.
- Freed-block ghost nodes with dangling-pointer arrows.
- Detection of use-after-free, double free, invalid free, NULL free, NULL dereference, invalid dereference, and uninitialized reads.
- Leak reporting and orphaned-allocation reporting.
- Predict mode, with pointer-target questions, score, streak, and localStorage persistence.
- Bundled samples for linked lists, binary trees, an array-style stack example, a linked queue, factorial recursion, and memory errors.

## Try it

These commands are for Windows PowerShell or Command Prompt:

```powershell
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in a browser.

## Supported C subset

The interpreter currently supports:

- Integer, character, `short`, `long`, `long long`, `unsigned`, `float`, `double`, `void`, `struct`, and typedef-defined struct names, with `struct Node *p` declarations.
- `const` and `static` qualifiers, multiple declarators, function prototypes, and the common `main` signatures.
- Pointer declarations, casts, pointer arithmetic, dereference, address-of, indexing, and pointer values.
- Pointer-to-pointer parameters and address-of expressions for variables, fields, and indexed elements.
- Struct declarations with fields, including pointer fields such as `next`, `left`, and `right`.
- Fixed-size `int` and `char` arrays, array initializers, array indexing, array parameters, two-dimensional arrays, and arrays of struct values.
- Struct values, the `.` operator, and passing struct addresses to functions.
- Variables, assignments (including chained assignment), compound assignments (`+=`, `-=`), arithmetic, comparisons, logical operators, the conditional operator (`?:`), unary `!`, unary `-`, dereference (`*`), address-of (`&`), and increment/decrement.
- Integer, character, string, and `NULL` literals.
- `if`/`else`, `while`, `do`/`while`, `for`, `break`, `continue`, and `switch`/`case`/`default`.
- User-defined functions, parameters, return values, and recursion.
- `malloc`, `calloc`, `realloc`, `free`, `sizeof` for supported types and expressions, `strlen`, `strcpy`, `strcmp`, `strcat`, `memset`, `getchar`, `exit`, and `printf` with `%d`, `%c`, `%s`, `%p`, `%f`, `%lf`, width, precision, and `%%`.
- `scanf` for `%d`, `%c`, and `%s` using the app's standard-input field, including repeated whitespace-separated input and indexed lvalue targets.
- Numeric and string `#define` constants. `#include` lines are accepted and ignored.
- `//` and `/* ... */` comments.

It does not currently support:

- Variable-length arrays and array features beyond the supported fixed-size scalar, struct, and two-dimensional arrays.
- Function pointers, unions, variadic functions, general pointer arithmetic beyond supported element indexing, and preprocessor directives other than numeric/string `#define` and ignored `#include`.
- The full C standard library or compilation with gcc/clang.

## How memory is simulated

Memlens runs an interpreter over a byte-addressable simulated memory model. Allocations begin at `0x1000`, pointer values are numeric simulated addresses, and each byte has shadow state such as unallocated, allocated-uninitialized, initialized, or freed. Every trace step stores memory, stack frames, heap fields, stdout, and pointer edges so the UI can move through the trace in either direction.

This is not gcc and it does not execute native machine code. It is an interpreter on a simulated memory model, so undefined behavior and diagnostics may differ from real hardware or a production compiler.

## Architecture

```text
src/
  lang/   Lexer and parser for the supported C subset
  vm/     Simulated memory, interpreter, trace model, and prediction logic
  viz/    Heap reachability, structure detection, and layout models
  ui/     React application shell, editor, diagrams, controls, and styles
  samples.ts  Bundled runnable sample programs
```

## Development commands

```powershell
npm test
npm run typecheck
npm run build
```

`npm test` runs the Vitest suite. `npm run typecheck` runs TypeScript without emitting files. `npm run build` type-checks and creates the Vite production build.

## Known limitations

- The supported language is intentionally small and is not a C compiler.
- Multidimensional arrays, variable-length arrays, and several common C type features are not implemented.
- The visualizer infers linked-list, queue, stack-like, and binary-tree shapes from pointer names and heap edges; it is not a general-purpose debugger layout engine.
- The memory model uses simulated addresses and simplified object sizes.
- Browser localStorage is used for the edited source and Predict score/streak; there is no backend or account synchronization.
- The production bundle currently includes CodeMirror in a large JavaScript chunk.

## Roadmap

- Function pointers
- Unions
- Bit-level memory view
- Shareable links
- Export a memory bug as an image or GIF

## Screenshots

The following files are placeholders for screenshots and a demo recording:

![Linked-list visualization](docs/screenshot-list.png)

![Use-after-free visualization](docs/screenshot-uaf.png)

![Binary-tree visualization](docs/screenshot-tree.png)


## License

MIT. See [LICENSE](./LICENSE).
