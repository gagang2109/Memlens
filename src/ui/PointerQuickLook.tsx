import { useEffect, useRef } from "react";
import type { FrameVariable, TraceStep } from "../vm/trace";

const hex = (address: number) => address < 0 ? `-0x${(-address).toString(16)}` : `0x${address.toString(16)}`;
export function getPointerDetails(variable: FrameVariable, step: TraceStep) {
  if (variable.stringPointer) return { value: JSON.stringify(variable.value), target: "String data", note: "This pointer contains simulated string data, not a heap address." };
  if (variable.value === "null" || variable.value === "0") return { value: "NULL", target: "No target" };
  const address = Number(variable.value);
  if (!Number.isInteger(address)) return { value: variable.value, target: "No recorded target" };
  const block = step.memory.allocations.find(candidate => address >= candidate.address && address < candidate.address + candidate.size);
  if (!block) return { value: hex(address), target: "No recorded heap block", note: "The trace does not record a heap target for this address." };
  const offset = address - block.address;
  const target = `${hex(block.address)} · ${block.size} bytes${offset ? ` · offset +${offset}` : ""}`;
  if (block.freeStep !== undefined) return { value: hex(address), target, note: `Freed at step ${block.freeStep}; not readable.` };
  const fields = !offset ? Object.entries(step.heap?.find(object => object.address === address)?.fields ?? {}) : [];
  const shadow = step.memory.shadows[address];
  const byte = shadow === "initialized" ? hex(step.memory.bytes[address]) : undefined;
  return { value: hex(address), target, note: !fields.length && !byte ? "No initialized value is recorded at this address." : undefined, fields, byte };
}

export function PointerQuickLook({ name, variable, step, onClose }: { name: string; variable: FrameVariable; step: TraceStep; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const details = getPointerDetails(variable, step);
  useEffect(() => { close.current?.focus(); }, []);
  return <div className="spotlight-scrim" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="spotlight pointer-quick-look" role="dialog" aria-modal="true" aria-label={`Quick Look: ${name}`}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
        if (event.key === "Tab") { event.preventDefault(); close.current?.focus(); }
      }}>
      <h2>Quick Look: {name}</h2>
      <dl><dt>Type</dt><dd>{variable.type}</dd><dt>Pointer value</dt><dd><code>{details.value}</code></dd><dt>Target</dt><dd>{details.target}</dd></dl>
      {details.note && <p>{details.note}</p>}
      {!!details.fields?.length && <dl className="quick-look-fields">{details.fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd><code>{value}</code></dd></div>)}</dl>}
      {!details.fields?.length && details.byte !== undefined && <p>Byte at target: <code>{details.byte}</code></p>}
      <button ref={close} type="button" onClick={onClose}>Close Quick Look</button>
    </section>
  </div>;
}
