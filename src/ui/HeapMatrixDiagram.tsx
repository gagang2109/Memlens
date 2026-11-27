import type { MemorySnapshot } from "../vm/memory";

const rowLimit = 12, columnLimit = 12;
const intBytes = 4;
type Cell = { address: number; value: number | undefined };
type Row = { index: number; slot: Cell; state: "not recorded" | "NULL" | "unknown row" | "freed row" | "live"; cells?: Cell[]; length?: number };

function cell(memory: MemorySnapshot, address: number): Cell {
  const complete = [0, 1, 2, 3].every(offset => memory.shadows[address + offset] === "initialized");
  const b = memory.bytes;
  return { address, value: complete ? b[address] | (b[address+1] << 8) | (b[address+2] << 16) | (b[address+3] << 24) : undefined };
}

export function readHeapMatrix(memory: MemorySnapshot, table: number) {
  const byBase = new Map(memory.allocations.map(allocation => [allocation.address, allocation]));
  const root = byBase.get(table);
  if (!root) return;
  const length = Math.floor(root.size / intBytes);
  const rows: Row[] = root.freeStep === undefined ? Array.from({length: Math.min(length,rowLimit)}, (_, index) => {
    const slot = cell(memory, table + index * intBytes);
    if (slot.value === undefined) return { index, slot, state: "not recorded" };
    if (slot.value === 0) return { index, slot, state: "NULL" };
    const allocation = byBase.get(slot.value);
    if (!allocation) return { index, slot, state: "unknown row" };
    if (allocation.freeStep !== undefined) return { index, slot, state: "freed row" };
    if (allocation.elementType !== "int" || allocation.elementSize !== intBytes) return { index, slot, state: "unknown row" };
    const length = Math.floor(allocation.size / intBytes);
    const cells = Array.from({length: Math.min(length,columnLimit)}, (_, col) => cell(memory, allocation.address + col * intBytes));
    return { index, slot, state: "live", length, cells };
  }) : [];
  return { table, length, freed: root.freeStep !== undefined, rows };
}

const hex = (value: number) => `0x${value.toString(16)}`;
export function HeapMatrixDiagram({ name, matrix, onClose }: {
  name: string; matrix: ReturnType<typeof readHeapMatrix>; onClose: () => void;
}) {
  return <section className="heap-matrix" aria-label={`Heap matrix ${name}`}>
    <div className="struct-queue-heading"><b>Heap matrix · {name}</b> <button type="button" onClick={onClose}>Close matrix view</button></div>
    {!matrix ? <p>Matrix pointer is not in scope at this step.</p>
      : matrix.freed ? <p>Pointer table at <code>{hex(matrix.table)}</code> was freed.</p>
      : <>
          <p>Pointer table at <code>{hex(matrix.table)}</code> · {matrix.length} {matrix.length === 1 ? "slot" : "slots"}</p>
          <small>Each slot stores a pointer. Each row has its own allocation and addresses.</small>
          <ol className="heap-matrix-rows" aria-label="Row pointer slots">
            {matrix.rows.map(row => <li key={row.index} data-matrix-row={row.index}>
              <div><b>[{row.index}]</b> <code>{hex(row.slot.address)}</code>
                <span aria-hidden="true"> → </span>
                {row.slot.value && row.slot.value > 0 ? <code>{hex(row.slot.value)}</code> : null}
                {row.state !== "live" && <span className="heap-matrix-state"> {row.state}</span>}
              </div>
              {row.cells && <div className="heap-matrix-cells" role="region" tabIndex={0} aria-label={`Cells of row ${row.index}`} data-run-shortcut="ignore">
                {row.cells.map((c,col) => <div key={c.address} data-matrix-col={col}>
                  <small>[{col}]</small><b>{c.value ?? "not recorded"}</b><code>{hex(c.address)}</code>
                </div>)}
                {row.length! > columnLimit && <small>First {columnLimit} cells shown</small>}
              </div>}
            </li>)}
          </ol>
          {matrix.length > rowLimit && <small>First {rowLimit} pointer slots shown.</small>}
        </>}
  </section>;
}
