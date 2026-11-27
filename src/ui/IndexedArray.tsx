import { useState } from "react";
import type { ArraySnapshot } from "../vm/trace";
import { describeChange, showCell, type VariableChange } from "./stepChanges";

const matrixPageSize = 12;
const stripPageSize = 32;
type WindowStart = { row: number; column: number };

const range = (start: number, count: number) => Array.from({ length: count }, (_, offset) => start + offset);
const pageStart = (index: number, size: number) => Math.floor(index / size) * size;

export function IndexedArray({ name, array, change, tourCell }: { name: string; array: ArraySnapshot; change?: VariableChange; tourCell?: number }) {
  const matrix = array.dimensions.length === 2;
  const [rows, columns] = matrix ? array.dimensions : [1, array.cells.length];
  const width = matrix ? matrixPageSize : stripPageSize;
  const height = matrix ? matrixPageSize : 1;
  const [start, setStart] = useState<WindowStart>({ row: 0, column: 0 });
  const row = Math.min(start.row, pageStart(Math.max(0, rows - 1), height));
  const column = Math.min(start.column, pageStart(Math.max(0, columns - 1), width));
  const endRow = Math.min(rows, row + height);
  const endColumn = Math.min(columns, column + width);
  const displayedColumns = range(column, endColumn - column);
  const changes = change && "cells" in change ? change.cells : undefined;
  const changedPages = new Map<number, WindowStart>();
  let visibleChanges = 0;
  if (changes && columns > 0) {
    for (const index of changes.keys()) {
      const r = Math.floor(index / columns);
      const c = index % columns;
      if (r >= row && r < endRow && c >= column && c < endColumn) visibleChanges++;
      const firstRow = pageStart(r, height);
      const firstColumn = pageStart(c, width);
      changedPages.set(firstRow * columns + firstColumn, { row: firstRow, column: firstColumn });
    }
  }
  const pages = [...changedPages.values()];
  const currentPage = pages.findIndex(page => page.row === row && page.column === column);
  const nextChangedPage = pages[(currentPage + 1) % pages.length];

  function cell(index: number) {
    const address = matrix ? `[${Math.floor(index / columns)}][${index % columns}]` : `[${index}]`;
    const delta = changes?.get(index);
    return {
      props: {
        className: `array-cell${delta ? " step-changed-cell" : ""}`,
        "data-cell": address,
        "data-tour-target": delta && index === tourCell ? "changed-value" : undefined,
        title: delta ? `${address}: ${describeChange(delta)}` : undefined,
      },
      value: <>{delta && <small className="step-value-before">{delta.before} →</small>}{showCell(array.cells[index])}</>,
    };
  }

  const scrollLabel = `${name} ${matrix ? "matrix" : "array"} contents`;
  return <div className="indexed-array" data-array={name}>
    <div className="array-dimensions">{matrix ? `${rows} rows × ${columns} columns` : `${columns} cells`}</div>
    {matrix ? <div className="matrix-scroll" role="region" aria-label={scrollLabel} tabIndex={0} data-run-shortcut="ignore">
      <table className="array-matrix" aria-label={`${name}[row][column]`}>
        <thead><tr><th className="matrix-corner" scope="col">row / col</th>
          {displayedColumns.map(c => <th key={c} scope="col">{c}</th>)}
        </tr></thead>
        <tbody>{range(row, endRow - row).map(r => <tr key={r}>
          <th scope="row">{r}</th>
          {displayedColumns.map(c => {
            const { props, value } = cell(r * columns + c);
            return <td key={c} {...props}>{value}</td>;
          })}
        </tr>)}</tbody>
      </table>
    </div> : <span className="array-cells" role="region" aria-label={scrollLabel} tabIndex={0} data-run-shortcut="ignore">
      {displayedColumns.map(index => {
        const { props, value } = cell(index);
        return <span key={index} {...props}><small>[{index}]</small>{value}</span>;
      })}
    </span>}
    {(rows > height || columns > width) && <div className="array-paging" role="group" aria-label={`Page through ${name}`}>
      {rows > height && <div className="array-page-row">
        <button type="button" disabled={row === 0} aria-label="Previous rows" onClick={() => setStart({ row: row - height, column })}>‹</button>
        <small>Rows {row}–{endRow - 1}</small>
        <button type="button" disabled={endRow === rows} aria-label="Next rows" onClick={() => setStart({ row: row + height, column })}>›</button>
      </div>}
      {columns > width && <div className="array-page-row">
        <button type="button" disabled={column === 0} aria-label={matrix ? "Previous columns" : "Previous cells"} onClick={() => setStart({ row, column: column - width })}>‹</button>
        <small>{matrix ? "Cols" : "Cells"} {column}–{endColumn - 1}</small>
        <button type="button" disabled={endColumn === columns} aria-label={matrix ? "Next columns" : "Next cells"} onClick={() => setStart({ row, column: column + width })}>›</button>
      </div>}
      {changes && visibleChanges < changes.size && <button type="button" onClick={() => setStart(nextChangedPage)}>Show next changed page ({changes.size - visibleChanges} off page)</button>}
    </div>}
  </div>;
}
