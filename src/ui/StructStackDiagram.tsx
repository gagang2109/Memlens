import type { FrameVariable } from "../vm/trace";

export function readStructStack(variables: Record<string, FrameVariable>, field: string) {
  const dot = field.lastIndexOf(".");
  const array = variables[field]?.array;
  if (dot < 0 || array?.dimensions.length !== 1 || !variables[field].type.startsWith("char[")) return undefined;
  const top = variables[`${field.slice(0, dot)}.top`];
  if (top?.type !== "int") return undefined;
  const index = Number(top.value);
  const valid = Number.isSafeInteger(index) && index >= 0 && index < array.cells.length;
  return { index, cells: array.cells, state: index === -1 ? "empty" : valid ? "occupied" : "unavailable" } as const;
}

export function StructStackDiagram({ name, stack, onClose }: { name: string; stack: ReturnType<typeof readStructStack>; onClose: () => void }) {
  return <section className="struct-stack-diagram" aria-label={`Stack ${name}`}>
    <div className="struct-queue-heading"><b>Array stack · {name}</b> <button type="button" onClick={onClose}>Close stack view</button></div>
    <small>Uses TOP as the last occupied index, with −1 for an empty stack.</small>
    {!stack ? <p>Stack is not in scope at this step.</p> : stack.state === "empty" ? <p>Stack is empty · TOP = −1</p>
      : stack.state === "unavailable" ? <p>No valid TOP at this step.</p>
      : <>
        <ol className="struct-stack-cells" aria-label="Occupied cells, top to bottom">
          {Array.from({length: Math.min(stack.index + 1, 32)}, (_, offset) => {
            const index = stack.index - offset;
            const value = stack.cells[index];
            return <li key={index} data-stack-index={index}>
              <small>[{index}]</small> <code>{value === null ? "not written" : JSON.stringify(value)}</code>
              {offset === 0 && <b>← TOP</b>}
            </li>;
          })}
        </ol>
        {stack.index >= 32 && <small>Showing the top 32 cells. See all indexed values in Call Stack.</small>}
      </>}
  </section>;
}
