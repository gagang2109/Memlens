import { useId, useMemo, useState } from "react";
import type { ArraySnapshot, TraceStep } from "../vm/trace";
import { readGraph, readLabTraversal } from "../viz/graph";

const centerX = 170, centerY = 146, nodeRadius = 13;
const layout = (size: number) => Array.from({ length: size }, (_, vertex) => {
  const angle = -Math.PI / 2 + 2 * Math.PI * vertex / size;
  const r = size > 1 ? 93 : 0;
  return { x: centerX + r * Math.cos(angle), y: centerY + r * Math.sin(angle) };
});

export function GraphDiagram({ name, array, exactLab, step, onClose }: { name: string; array?: ArraySnapshot; exactLab: boolean; step: TraceStep; onClose?: () => void }) {
  const [preferUndirected, setPreferUndirected] = useState(exactLab);
  const marker = useId();
  const graph = useMemo(() => array && readGraph(array, preferUndirected), [array, preferUndirected]);
  const state = exactLab && graph ? readLabTraversal(step, graph.size) : undefined;
  const nodes = graph ? layout(graph.size) : [];
  return <section className="graph-diagram" aria-label="Adjacency graph">
    <div className="graph-header">
      <b>{name} · {graph?.size ?? 0} vertices</b>
      {graph && <label><input type="checkbox" checked={preferUndirected} onChange={e => setPreferUndirected(e.target.checked)} /> Undirected if symmetric</label>}
      {onClose && <button type="button" onClick={onClose}>Close graph</button>}
    </div>
    {!graph ? <p>The selected matrix is not available at this step.</p> : <>
      <div className="graph-caption">{graph.directed ? preferUndirected ? "Directed · matrix is asymmetric" : "Directed" : "Undirected"} · Nonzero cells are edges</div>
      <svg viewBox="0 0 340 288" role="img" aria-label={`Graph with ${graph.size} vertices and ${graph.edges.length} edges`}>
        <defs><marker id={marker} markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="currentColor" /></marker></defs>
        {graph.edges.map(({ from, to, weight, paired }) => {
          const a = nodes[from], b = nodes[to];
          const distance = Math.hypot(b.x - a.x, b.y - a.y);
          const dx = distance ? (b.x - a.x) / distance : 0, dy = distance ? (b.y - a.y) / distance : 0;
          const offset = paired ? 5 : 0;
          const nx = -dy * offset, ny = dx * offset;
          const path = from === to
            ? `M${a.x - 9},${a.y - 9} C${a.x - 34},${a.y - 43} ${a.x + 34},${a.y - 43} ${a.x + 9},${a.y - 9}`
            : `M${a.x + dx * nodeRadius + nx},${a.y + dy * nodeRadius + ny} L${b.x - dx * nodeRadius + nx},${b.y - dy * nodeRadius + ny}`;
          const label = `${from} ${graph.directed ? "→" : "—"} ${to}`;
          return <g key={`${from}-${to}`} data-edge={`${from},${to}`}>
            <title>{`${label} (matrix value ${weight})`}</title>
            <path className="graph-edge" d={path} markerEnd={graph.directed ? `url(#${marker})` : undefined} />
            {weight !== 1 && <text className="graph-weight" x={from === to ? a.x : (a.x + b.x) / 2 + nx * 2 - dy * (paired ? 0 : 8)}
              y={from === to ? a.y - 33 : (a.y + b.y) / 2 + ny * 2 + dx * (paired ? 0 : 8)}>{weight}</text>}
          </g>;
        })}
        {nodes.map(({x, y}, vertex) => {
          const phase = state?.active === vertex ? "active" : state?.pending.includes(vertex) && state.kind === "BFS" ? "queued" : state?.discovered.includes(vertex) ? "discovered" : "unmarked";
          return <g key={vertex} className={`graph-vertex graph-${phase}`} data-vertex={vertex} data-phase={phase} transform={`translate(${x},${y})`}>
            <title>{`Vertex ${vertex}: ${phase}`}</title><circle r={nodeRadius} /><text y="1">{vertex}</text>
          </g>;
        })}
      </svg>
      {state && <dl className="graph-state" aria-label={`${state.kind} traversal state`}>
        <div><dt>{state.kind === "BFS" ? "Current dequeued vertex" : "Active DFS call"}</dt><dd>{state.active ?? "None yet"}</dd></div>
        <div><dt>{state.kind === "BFS" ? "Pending queue · front to back" : "DFS calls · oldest to newest"}</dt><dd>{state.pending.length ? state.pending.join(" → ") : "Empty"}</dd></div>
        <div><dt>Discovered</dt><dd>{state.discovered.length ? state.discovered.join(", ") : "None yet"}</dd></div>
      </dl>}
    </>}
  </section>;
}
