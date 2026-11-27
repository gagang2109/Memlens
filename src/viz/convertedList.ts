import type { TraceStep, HeapView } from "../vm/trace";
import type { TreeChildAliases } from "../lang/parser";

export type ConvertedList = { head: number; fields: TreeChildAliases; addresses: number[] };

function address(value?: string) {
  if (value === "null" || value === "0") return 0;
  return value !== undefined && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value) : undefined;
}

// Certify only a live, NULL-ended chain from the chosen head, using the
// exact self-pointer fields recorded from the same declared struct type.
// A tree, cycle or partially rewired list is never treated as a full list.
export function convertedList(step: TraceStep, head: number): ConvertedList | undefined {
  const heap = new Map((step.heap ?? []).map(node => [node.address, node]));
  const live = new Set(step.memory.allocations.filter(block => block.freeStep === undefined).map(block => block.address));
  const first = heap.get(head);
  const fields = first?.treeChildAliases;
  if (!first?.type || !fields || !live.has(head)) return;
  const [prevField, nextField] = fields;
  const edge = new Map((step.pointers ?? []).filter(pointer => !pointer.dangling).map(pointer => [pointer.from, pointer.to]));
  const pointerValue = (node: HeapView, field: string) => {
    const target = address(node.fields[field]);
    return target === 0 || edge.get(`0x${node.address.toString(16)}.${field}`) === target ? target : undefined;
  };
  const seen = new Set<number>();
  const addresses: number[] = [];
  let current = head, prev = 0;
  while (current !== 0) {
    const node = heap.get(current);
    if (!node || node.type !== first.type || !live.has(current) || seen.has(current) ||
        node.treeChildAliases?.[0] !== prevField || node.treeChildAliases[1] !== nextField ||
        pointerValue(node, prevField) !== prev) return;
    const next = pointerValue(node, nextField);
    if (next === undefined) return;
    seen.add(current);
    addresses.push(current);
    prev = current;
    current = next;
  }
  return addresses.length > 1 ? { head, fields, addresses } : undefined;
}
