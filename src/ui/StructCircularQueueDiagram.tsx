import type { CSSProperties } from "react";
import type { FrameVariable } from "../vm/trace";

const visualLimit = 32;

export function readCircularQueue(variables: Record<string, FrameVariable>, field: string) {
  const dot = field.lastIndexOf(".");
  const array = variables[field]?.array;
  if (dot < 0 || array?.dimensions.length !== 1 || !variables[field].type.startsWith("int[")) return undefined;
  const owner = field.slice(0, dot);
  const fields = ["front", "rear", "count"].map(name => variables[`${owner}.${name}`]);
  if (fields.some(member => member?.type !== "int")) return undefined;
  const [front, rear, count] = fields.map(member => Number(member.value));
  const capacity = array.cells.length;
  const indexesValid = [front, rear].every(i => Number.isSafeInteger(i) && i >= 0 && i < capacity);
  const countValid = Number.isSafeInteger(count) && count >= 0 && count <= capacity;
  const coherent = indexesValid && countValid && (front + count) % capacity === rear;
  const occupied = (index: number) => coherent && (index - front + capacity) % capacity < count;
  return { front, rear, count, capacity, indexesValid, countValid, coherent, occupied, cells: array.cells };
}

export function StructCircularQueueDiagram({ name, queue, onClose }: {
  name: string; queue: ReturnType<typeof readCircularQueue>; onClose: () => void;
}) {
  const itemText = (value: number | string | null) => value ?? "not written";
  return <section className="struct-queue-diagram" aria-label={`Circular queue ${name}`}>
    <div className="struct-queue-heading"><b>Circular queue · {name}</b> <button type="button" onClick={onClose}>Close queue view</button></div>
    <small>FRONT is the next removal. REAR is the next insertion. Count tells full from empty when the indexes match.</small>
    {!queue ? <p>Queue is not in scope at this step.</p> : <>
      <p><b>FRONT</b> [{queue.indexesValid ? queue.front : "?"}] · <b>REAR</b> [{queue.indexesValid ? queue.rear : "?"}] · <b>Count</b> {queue.countValid ? queue.count : "?"}/{queue.capacity}</p>
      <div className="circular-buffer-frame">
        <div className={`struct-queue-cells${queue.capacity >= 3 && queue.capacity <= 6 ? " circular-orbit" : ""}`}
          role="region" tabIndex={0} aria-label="Physical circular buffer" data-run-shortcut="ignore">
          {queue.cells.slice(0, visualLimit).map((value, index) => {
            const angle = 2 * Math.PI * index / queue.capacity;
            const position = { "--ring-x": `${50 + 35 * Math.sin(angle)}%`, "--ring-y": `${50 - 35 * Math.cos(angle)}%` } as CSSProperties;
            return <span key={index} style={position}
              className={`struct-queue-cell${queue.occupied(index) ? " circular-occupied" : ""}`} data-ring-index={index}>
              <small>{[queue.front === index && "FRONT", queue.rear === index && "REAR"].filter(Boolean).join(" / ")}</small>
              <b>{itemText(value)}</b><small>[{index}]</small>
            </span>;
          })}
        </div>
      </div>
      <small>{queue.capacity > visualLimit ? "Showing the first 32 physical cells. Full buffer in Call Stack." : `↩ After [${queue.capacity - 1}], the index wraps to [0].`}</small>
      {!queue.coherent ? <p>FRONT, REAR and count do not agree at this step. The program may still be updating them.</p>
        : queue.count === 0 ? <p>Queue is empty. Old values can remain in the buffer.</p>
        : <>
          <p>{queue.count === queue.capacity ? <b>Queue is full · </b> : null}<b>FIFO order</b> (next out first)</p>
          <ol className="circular-fifo" aria-label="FIFO removal order">
            {Array.from({length: Math.min(queue.count, visualLimit)}, (_, offset) => {
              const index = (queue.front + offset) % queue.capacity;
              return <li key={index} data-fifo-index={index}><b>{itemText(queue.cells[index])}</b> <small>[{index}]</small></li>;
            })}
          </ol>
          {queue.count > visualLimit && <small>Showing the first 32 items in removal order.</small>}
        </>}
    </>}
  </section>;
}
