import type { FrameVariable } from "../vm/trace";

export function canShowLinearQueue(variables: Record<string, FrameVariable>, field: string) {
  const dot = field.lastIndexOf(".");
  if (dot < 0 || variables[field]?.array?.dimensions.length !== 1) return false;
  const owner = field.slice(0, dot);
  return ["front", "rear"].every(name => variables[`${owner}.${name}`]?.type === "int");
}

export function readLinearQueue(variables: Record<string, FrameVariable>, field: string) {
  if (!canShowLinearQueue(variables, field)) return undefined;
  const owner = field.slice(0, field.lastIndexOf("."));
  const cells = variables[field].array!.cells;
  const front = Number(variables[`${owner}.front`].value), rear = Number(variables[`${owner}.rear`].value);
  const empty = front === -1 && rear === -1;
  const valid = Number.isSafeInteger(front) && Number.isSafeInteger(rear) && front >= 0 && front <= rear && rear < cells.length;
  return { cells, front, rear, state: empty ? "empty" : valid ? "range" : "unsupported" } as const;
}

export function StructQueueDiagram({ name, queue, onClose }: { name: string; queue: ReturnType<typeof readLinearQueue>; onClose: () => void }) {
  return <section className="struct-queue-diagram" aria-label={`Linear queue ${name}`}>
    <div className="struct-queue-heading"><b>Linear queue · {name}</b> <button type="button" onClick={onClose}>Close queue view</button></div>
    <small>Uses inclusive front and rear indexes. This view does not interpret circular queues.</small>
    {!queue ? <p>Queue is not in scope at this step.</p> : queue.state === "empty" ? <p>Queue is empty · FRONT = REAR = −1</p>
      : queue.state !== "range" ? <p>No valid linear range at this step.</p>
      : <>
        <p><b>FRONT</b> [{queue.front}] · <b>REAR</b> [{queue.rear}]</p>
        <div className="struct-queue-cells" role="region" tabIndex={0} aria-label="Stored values between front and rear" data-run-shortcut="ignore">
          {queue.cells.slice(queue.front, Math.min(queue.rear + 1, queue.front + 32)).map((value, j) => {
            const i = queue.front + j;
            return <span key={i} className="struct-queue-cell" data-queue-index={i}>
              <small>{i === queue.front ? "FRONT" : ""}{i === queue.front && i === queue.rear ? " / " : ""}{i === queue.rear ? "REAR" : ""}</small>
              <b>{value ?? "not written"}</b><small>[{i}]</small>
            </span>;
          })}
        </div>
        {queue.rear - queue.front >= 32 && <small>Showing the first 32 cells. See all indexed values in Call Stack.</small>}
      </>}
  </section>;
}
