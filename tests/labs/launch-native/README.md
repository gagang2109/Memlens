# Custom C launch examples

From the repository root, run `node tests/labs/launch-native/run.cjs`.
This needs Node, the installed project dependencies, and GCC with UBSan. It compiles the original fixtures in a temporary directory, compares exact stdout with Memlens, and checks targeted snapshots before and after rewind. It also sends interactive lines and EOF to the simulated console and compares the results with native C.

The record-console fixture covers bounded name input, seat numbers, section
letters, and decimal marks in a C struct array. It checks scripted and
line-by-line input, early EOF, a rejected numeric field, sorting in a helper,
fractional maximum selection, and rewinding whole-record swaps without
changing the addresses of the slots.
