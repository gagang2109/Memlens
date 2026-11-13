import type { TraceStep, PointerArrow } from "../vm/trace";

export type LayoutNode = {
  address: number;
  x: number;
  y: number;
  orphaned: boolean;
  freed: boolean;
  freedAtStep?: number;
  label: string;
  value: string;
  fields?: string[];
  next: string;
  type?: string;
  raw: boolean;
  size: number;
  elementType?: string;
};
export type RenderShape = "singly-linked-list" | "tree" | "stack" | "queue" | "grid";
export type RenderModel = { nodes: LayoutNode[]; arrows: PointerArrow[]; shape: RenderShape; canvasWidth: number; canvasHeight: number };

const addressOf = (address: number) => `0x${address.toString(16)}`;

export function renderModel(step: TraceStep): RenderModel {
  const pointers = step.pointers ?? [];
  const heap = new Map((step.heap ?? []).map(object => [object.address, object]));
  const heapEdges = pointers.filter(pointer => pointer.from.startsWith("0x"));
  const roots = pointers.filter(pointer => !pointer.from.startsWith("0x") && !pointer.dangling);
  const reachable = new Set<number>();
  const visit = (address: number) => {
    if (reachable.has(address)) return;
    const allocation = step.memory.allocations.find(candidate => candidate.address === address);
    if (!allocation || allocation.freeStep !== undefined) return;
    reachable.add(address);
    heapEdges.filter(pointer => pointer.from.startsWith(`${addressOf(address)}.`) && !pointer.dangling).forEach(pointer => visit(pointer.to));
  };
  roots.forEach(root => visit(root.to));

  const nodes: LayoutNode[] = step.memory.allocations.map(allocation => {
    const object = heap.get(allocation.address);
    const freed = allocation.freeStep !== undefined;
    const type = object?.type ?? allocation.type;
    const raw = !!type && /^(?:int|char|short|long|float|double|void)(?:\s|$)/.test(type);
    const nextPointer = pointers.find(pointer => pointer.from === `${addressOf(allocation.address)}.next`);
    const scalarFields = object ? Object.entries(object.fields).filter(([field]) => !["next", "prev", "left", "right"].includes(field)) : [];
    return {
      address: allocation.address, x: 20, y: 120, orphaned: !freed && !reachable.has(allocation.address), freed,
      freedAtStep: allocation.freeStep, label: addressOf(allocation.address),
      value: scalarFields.length === 1 ? scalarFields[0][1] : scalarFields.length ? scalarFields.map(([field, value]) => `${field}: ${value}`).join(" | ") : "—",
      fields: scalarFields.map(([field, value]) => `${field}: ${value}`),
      next: nextPointer ? addressOf(nextPointer.to) : "NULL", type, raw, size: allocation.size,
      elementType: type && /^(int|char|short|long|float|double)$/.test(type) ? type : undefined,
    };
  });

  const rootNames = roots.map(root => root.from.toLowerCase());
  const preferredRoots = roots.filter(root => /(?:list|head|first)/.test(root.from.toLowerCase()));
  const ordered: LayoutNode[] = [];
  const orderedAddresses = new Set<number>();
  const followNext = (address: number) => {
    if (orderedAddresses.has(address)) return;
    const node = nodes.find(candidate => candidate.address === address);
    if (!node || node.raw) return;
    ordered.push(node); orderedAddresses.add(address);
    const next = heapEdges.find(pointer => pointer.from === `${addressOf(address)}.next`);
    if (next) followNext(next.to);
  };
  [...preferredRoots, ...roots].forEach(root => followNext(root.to));
  nodes.filter(node => !orderedAddresses.has(node.address)).forEach(node => ordered.push(node));

  const hasTreeEdges = heapEdges.some(pointer => pointer.label === "left" || pointer.label === "right");
  const hasListEdges = heapEdges.some(pointer => pointer.label === "next");
  const shape: RenderShape = hasTreeEdges ? "tree" : hasListEdges ? (rootNames.some(name => name.includes("front") || name.includes("rear")) ? "queue" : "singly-linked-list") : rootNames.some(name => name.includes("top") || name.includes("stack")) ? "stack" : "grid";
  let canvasWidth = 520;
  let canvasHeight = 285;
  if (shape === "singly-linked-list" || shape === "queue") {
    const reachableNodes = ordered.filter(node => reachable.has(node.address));
    const otherNodes = ordered.filter(node => !reachable.has(node.address));
    reachableNodes.forEach((node, index) => { node.x = 20 + index * 145; node.y = 105; });
    // Leave room for the lower row's variable tags (40px above each node),
    // plus clearance below the preceding 78px node.
    otherNodes.forEach((node, index) => { node.x = 20 + index * 145; node.y = 245; });
    canvasWidth = Math.max(520, (ordered.length ? Math.max(...ordered.map(node => node.x)) : 0) + 146);
  } else if (shape === "stack") {
    ordered.forEach((node, index) => { node.x = 175; node.y = 60 + index * 140; });
  }
  if (shape === "grid") {
    // Independent buffers/structs have no connecting edge to order them. Give
    // each its own cell, including room for all variable aliases above it.
    const tagCounts = new Map<number, number>();
    for (const pointer of pointers) {
      if (!pointer.from.startsWith("0x")) tagCounts.set(pointer.to, (tagCounts.get(pointer.to) ?? 0) + 1);
    }
    let x = 20;
    ordered.forEach((node, index) => {
      if (index % 3 === 0) x = 20;
      node.x = x;
      node.y = 60 + Math.floor(index / 3) * 140;
      const tags = tagCounts.get(node.address) ?? 0;
      x += Math.max(164, tags ? 27 + (tags - 1) * 76 + 72 + 20 : 0);
      canvasWidth = Math.max(canvasWidth, x);
    });
  }
  if (shape === "tree") {
    const children = new Set(heapEdges.filter(pointer => pointer.label === "left" || pointer.label === "right").map(pointer => pointer.to));
    const root = nodes.find(node => !children.has(node.address));
    const childOf = (address: number, label: string) => {
      const pointer = heapEdges.find(edge => edge.from === `${addressOf(address)}.${label}`);
      return pointer ? nodes.find(candidate => candidate.address === pointer.to) : undefined;
    };
    let leaf = 0;
    const measured = new Set<number>();
    const depthOf = (node: LayoutNode | undefined): number => {
      if (!node || measured.has(node.address)) return 0;
      measured.add(node.address);
      return 1 + Math.max(depthOf(childOf(node.address, "left")), depthOf(childOf(node.address, "right")));
    };
    // Student pointer graphs can contain cycles or shared children. Visit each
    // block once while retaining every pointer arrow for inspection.
    const placed = new Set<number>();
    const place = (node: LayoutNode, depth: number): number => {
      if (placed.has(node.address)) return node.x;
      placed.add(node.address);
      const left = childOf(node.address, "left");
      const right = childOf(node.address, "right");
      if (left) place(left, depth + 1);
      const x = left && right ? (left.x + right.x) / 2 : left ? left.x + 82 : right ? right.x - 82 : 48 + leaf++ * 164;
      // Leave 40px for child alias tags plus a 78px parent card and
      // 22px clearance. The prior 92px level stride put tags over parents.
      node.x = x; node.y = 60 + depth * 140;
      if (right) place(right, depth + 1);
      return x;
    };
    if (root) {
      place(root, 0);
      const depth = depthOf(root);
      const minX = Math.min(...nodes.map(node => node.x));
      if (minX < 20) nodes.forEach(node => { node.x += 20 - minX; });
      canvasWidth = Math.max(520, Math.max(...nodes.map(node => node.x)) + 164);
      canvasHeight = 55 + depth * 140;
    }
    // Rootless cycles and disconnected blocks are not part of the selected
    // tree. Keep them inspectable in a separate row instead of stacking them
    // at the default coordinates; preserve all real pointer arrows.
    const unplaced = nodes.filter(node => !placed.has(node.address));
    const placedNodes = nodes.filter(node => placed.has(node.address));
    const extraY = placedNodes.length ? Math.max(...placedNodes.map(node => node.y)) + 140 : 60;
    unplaced.forEach((node, index) => { node.x = 20 + index * 164; node.y = extraY; });
    canvasWidth = Math.max(canvasWidth, ...nodes.map(node => node.x + 164));
  }
  // The SVG clips at its viewBox even when the outer viewport is scrollable.
  // Include every row (especially freed/orphaned blocks and tall stacks), plus
  // room for the 78px node, its address label, stroke and drop shadow.
  const variableTagCounts = new Map<number, number>();
  for (const pointer of pointers) {
    if (!pointer.from.startsWith("0x")) variableTagCounts.set(pointer.to, (variableTagCounts.get(pointer.to) ?? 0) + 1);
  }
  for (const node of nodes) {
    canvasHeight = Math.max(canvasHeight, node.y + 78 + 20);
    // StructureDiagram places 72px variable tags at x + 27, 76px apart.
    // Count dangling aliases too, so their labels remain reachable when panning.
    const tagCount = variableTagCounts.get(node.address) ?? 0;
    if (tagCount) canvasWidth = Math.max(canvasWidth, node.x + 27 + (tagCount - 1) * 76 + 72 + 20);
  }
  return { nodes, arrows: pointers.filter(pointer => nodes.some(node => node.address === pointer.to)), shape, canvasWidth, canvasHeight };
}
