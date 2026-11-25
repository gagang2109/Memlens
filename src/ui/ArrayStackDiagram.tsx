import type { TraceStep } from "../vm/trace";

// This view is enabled only for the unchanged examples that use a signed
// index of the last occupied element. Other programs may give "top" a
// different meaning. These examples have one small, fixed integer array.
export function readArrayStack(step: TraceStep) {
  for (const frame of step.frames) {
    const stack = frame.variables?.stack;
    const top = frame.variables?.top;
    if (!stack || !top || stack.pointer || top.pointer || stack.type !== "int" || top.type !== "int") continue;
    if (!/^\[-?\d+(?:, -?\d+)*\]$/.test(stack.value) || !/^-?\d+$/.test(top.value)) continue;
    const slots = stack.value.slice(1, -1).split(", ");
    const index = Number(top.value);
    if (!Number.isInteger(index) || index < -1 || index >= slots.length) continue;
    return { top: index, capacity: slots.length, items: slots.slice(0, index + 1).map((value, index) => ({ value, index })).reverse() };
  }
}

export function ArrayStackDiagram({ stack }: { stack: ReturnType<typeof readArrayStack> }) {
  return <section className="array-stack-diagram" aria-label="Array stack diagram">
    <div className="array-stack-caption"><b>ARRAY STACK</b>{stack && <span>{stack.items.length} / {stack.capacity} occupied</span>}</div>
    {!stack ? <p>The stack appears once its array and top index are declared.</p> : stack.top === -1
      ? <p><strong>TOP = −1</strong> · Empty stack</p>
      : <ol role="list" aria-label="Stack items, top to bottom">
        {stack.items.map(({index, value}) => <li key={index}>
          <span className="array-stack-top">{index === stack.top && <>TOP <span aria-hidden="true">→</span></>}</span>
          <div className="array-stack-cell"><small>[{index}]</small><b>{value}</b></div>
        </li>)}
      </ol>}
    <p>Push and pop happen at TOP. The call stack still shows the full backing array.</p>
  </section>;
}
