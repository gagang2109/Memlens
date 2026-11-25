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
export type QueueEndpoint = { role: "front" | "rear"; from: string; address: number | null };
export type RenderModel = { queueEndpoints?: [QueueEndpoint, QueueEndpoint]; nodes: LayoutNode[]; arrows: PointerArrow[]; shape: RenderShape; canvasWidth: number; canvasHeight: number };

const addressOf = (address: number) => `0x${address.toString(16)}`;

// Route same-row next pointers that return to an earlier card (or to
// themselves) below the row, rather than through opaque node rectangles.
export function listReturnLink(shape: RenderShape, label: string, source: LayoutNode, target: LayoutNode) {
  if ((shape !== "singly-linked-list" && shape !== "queue") || label !== "next" ||
      source.y !== target.y || target.x > source.x) return undefined;
  const exit = source.x + 126, gutter = exit + 9, entry = target.x + 63;
  const top = source.y + 27, bottom = source.y + 94;
  return {
    bottom,
    path: `M${exit} ${top} H${gutter - 4} Q${gutter} ${top} ${gutter} ${top + 4} V${bottom - 5} Q${gutter} ${bottom} ${gutter - 5} ${bottom} H${entry + 5} Q${entry} ${bottom} ${entry} ${bottom - 5} V${target.y + 78}`,
  };
}

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

  // Keep the same queue layout before the first link is made and after the
  // last removal, when a next edge alone cannot identify the structure.
  let queueEndpoints: [QueueEndpoint, QueueEndpoint] | undefined;
  for (const frame of [...step.frames].reverse()) {
    const front = frame.variables?.front;
    const rear = frame.variables?.rear;
    if (!front?.pointer || !rear?.pointer || front.stringPointer || rear.stringPointer ||
        front.type !== rear.type || !/^struct .+ \*$/.test(front.type)) continue;
    const address = (value: string) => value === "null" || value === "0" ? null : Number(value);
    const first = address(front.value), last = address(rear.value);
    if ([first, last].some(value => value !== null && (!Number.isSafeInteger(value) || value < 1))) continue;
    queueEndpoints = [{role:"front",from:`${frame.name}.front`,address:first}, {role:"rear",from:`${frame.name}.rear`,address:last}];
    break;
  }
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
  const frontAddress = queueEndpoints?.[0].address;
  if (frontAddress && reachable.has(frontAddress)) followNext(frontAddress);
  [...preferredRoots, ...roots].forEach(root => followNext(root.to));
  nodes.filter(node => !orderedAddresses.has(node.address)).forEach(node => ordered.push(node));

  const hasTreeEdges = heapEdges.some(pointer => pointer.label === "left" || pointer.label === "right");
  const hasListEdges = heapEdges.some(pointer => pointer.label === "next");
  const shape: RenderShape = hasTreeEdges ? "tree" : queueEndpoints || (hasListEdges && rootNames.some(name => name.includes("front") || name.includes("rear"))) ? "queue"
    : hasListEdges ? "singly-linked-list" : rootNames.some(name => name.includes("top") || name.includes("stack")) ? "stack" : "grid";
  const variableTagCounts = new Map<number, number>();
  for (const pointer of pointers) {
    if (!pointer.from.startsWith("0x")) variableTagCounts.set(pointer.to, (variableTagCounts.get(pointer.to) ?? 0) + 1);
  }
  let canvasWidth = 520;
  let canvasHeight = 285;
  if (shape === "singly-linked-list" || shape === "queue") {
    const reachableNodes = ordered.filter(node => reachable.has(node.address));
    const otherNodes = ordered.filter(node => !reachable.has(node.address));
    const placeRow = (row: LayoutNode[], y: number) => {
      let x = 20;
      for (const node of row) {
        node.x = x; node.y = y;
        const tagCount = variableTagCounts.get(node.address) ?? 0;
        const queueTagWidth = shape === "queue" && tagCount ? 27 + (tagCount - 1) * 76 + 72 + 16 : 0;
        x += Math.max(145, queueTagWidth);
      }
    };
    placeRow(reachableNodes, 105);
    // Leave room for the lower row's variable tags (40px above each node),
    // plus clearance below the preceding 78px node.
    placeRow(otherNodes, 245);
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
    const byAddress = new Map(nodes.map(node => [node.address, node]));
    const branches = new Map<string, LayoutNode>();
    const children = new Set<number>();
    for (const pointer of heapEdges) {
      if (pointer.label !== "left" && pointer.label !== "right") continue;
      const target = byAddress.get(pointer.to);
      if (target && !branches.has(pointer.from)) {
        branches.set(pointer.from, target);
        children.add(target.address);
      }
    }
    const childOf = (node: LayoutNode, side: "left" | "right") => branches.get(`${node.label}.${side}`);
    const root = nodes.find(node => !children.has(node.address) && (childOf(node, "left") || childOf(node, "right")));

    type Subtree = {
      node: LayoutNode;
      rootX: number;
      width: number;
      left?: Subtree;
      right?: Subtree;
      rightOffset: number;
    };
    const placed = new Set<number>();
    const halfGap = 82;
    const measure = (node: LayoutNode | undefined): Subtree | undefined => {
      if (!node || placed.has(node.address)) return;
      // Student graphs can contain cycles or shared children. Each block
      // occupies space once; all original arrows still appear in the canvas.
      placed.add(node.address);
      const left = measure(childOf(node, "left"));
      const right = measure(childOf(node, "right"));
      const rightOffset = left?.width ?? (right ? Math.max(0, halfGap - right.rootX) : 0);
      const rootX = left && right ? (left.rootX + rightOffset + right.rootX) / 2
        : left ? left.rootX + halfGap : right ? rightOffset + right.rootX - halfGap : 0;
      const width = Math.max(rootX + 2 * halfGap, left?.width ?? 0, right ? rightOffset + right.width : 0);
      return { node, rootX, width, left, right, rightOffset };
    };
    const place = (subtree: Subtree, offset: number, depth: number) => {
      subtree.node.x = offset + subtree.rootX;
      // Leave room for child alias tags above each card.
      subtree.node.y = 60 + depth * 140;
      if (subtree.left) place(subtree.left, offset, depth + 1);
      if (subtree.right) place(subtree.right, offset + subtree.rightOffset, depth + 1);
    };
    const layout = measure(root);
    if (layout) place(layout, 20, 0);
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
  for (const node of nodes) {
    canvasHeight = Math.max(canvasHeight, node.y + 78 + 20);
    // StructureDiagram places 72px variable tags at x + 27, 76px apart.
    // Count dangling aliases too, so their labels remain reachable when panning.
    const tagCount = variableTagCounts.get(node.address) ?? 0;
    if (tagCount) canvasWidth = Math.max(canvasWidth, node.x + 27 + (tagCount - 1) * 76 + 72 + 20);
  }
  const nodesByLabel = new Map(nodes.map(node => [node.label, node]));
  const arrows = pointers.filter(pointer => nodesByLabel.has(addressOf(pointer.to)));
  if (shape === "singly-linked-list" || shape === "queue") {
    for (const arrow of arrows) {
      if (arrow.label !== "next" || !arrow.from.startsWith("0x")) continue;
      const source = nodesByLabel.get(arrow.from.split(".")[0]);
      const target = nodesByLabel.get(addressOf(arrow.to))!;
      const route = source && listReturnLink(shape, arrow.label, source, target);
      if (route) canvasHeight = Math.max(canvasHeight, route.bottom + 14);
    }
  }
  return { nodes, ...(shape === "queue" ? { queueEndpoints } : {}), arrows, shape, canvasWidth, canvasHeight };
}
