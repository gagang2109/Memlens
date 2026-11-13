import { describe, expect, it } from "vitest";
import { run } from "../vm/interpreter";
import { samples } from "../samples";
import { renderModel } from "./model";

describe("memory visualization model", () => {
  it("lays out next-linked heap nodes as a singly linked list", () => {
    const model = renderModel({
      index: 0, line: 1, stdout: "", pointers: [
        { from: "main.head", to: 4096, label: "head", dangling: false },
        { from: "0x1000.next", to: 4112, label: "next", dangling: false },
      ],
      memory: { bytes: [], shadows: [], allocations: [
        { address: 4096, size: 16, allocStep: 0, line: 1 },
        { address: 4112, size: 16, allocStep: 0, line: 1 },
      ] }, frames: [],
    });
    expect(model.shape).toBe("singly-linked-list"); expect(model.nodes[0].x).toBeLessThan(model.nodes[1].x); expect(model.nodes[0].y).toBe(model.nodes[1].y);
  });
  it("places unreachable list blocks on a separate row and models raw allocations", () => {
    const model = renderModel({
      index: 0, line: 1, stdout: "", pointers: [
        { from: "main.head", to: 4096, label: "head", dangling: false },
        { from: "0x1000.next", to: 4112, label: "next", dangling: false },
      ],
      memory: { bytes: [], shadows: [], allocations: [
        { address: 4096, size: 16, allocStep: 0, line: 1, type: "Node" },
        { address: 4112, size: 16, allocStep: 0, line: 1, type: "Node" },
        { address: 4128, size: 10, allocStep: 0, line: 1, type: "int" },
      ] }, frames: [],
    });
    expect(model.nodes.find(node => node.address === 4128)?.raw).toBe(true);
    expect(model.nodes.find(node => node.address === 4128)?.y).toBeGreaterThan(model.nodes.find(node => node.address === 4096)?.y ?? 0);
  });
  it("lays out left/right edges as a tree", () => {
    const model = renderModel({
      index: 0, line: 1, stdout: "", pointers: [
        { from: "main.root", to: 4096, label: "root", dangling: false },
        { from: "0x1000.left", to: 4112, label: "left", dangling: false },
        { from: "0x1000.right", to: 4128, label: "right", dangling: false },
      ],
      memory: { bytes: [], shadows: [], allocations: [
        { address: 4096, size: 16, allocStep: 0, line: 1 },
        { address: 4112, size: 16, allocStep: 0, line: 1 },
        { address: 4128, size: 16, allocStep: 0, line: 1 },
      ] }, frames: [],
    });
    expect(model.shape).toBe("tree");
    expect(model.nodes[1].y).toBeGreaterThan(model.nodes[0].y);
    expect(model.nodes[2].y).toBeGreaterThan(model.nodes[0].y);
  });
  it("does not mark a heap child orphan when reachable through another heap node", () => {
    const model = renderModel({
      index: 0, line: 1, stdout: "", pointers: [
        { from: "main.head", to: 4096, label: "head", dangling: false },
        { from: "0x1000.next", to: 4112, label: "next", dangling: false },
      ],
      heap: [
        { address: 4096, fields: { val: "10", next: "4112" } },
        { address: 4112, fields: { val: "20", next: "NULL" } },
      ],
      memory: { bytes: [], shadows: [], allocations: [
        { address: 4096, size: 16, allocStep: 0, line: 1 },
        { address: 4112, size: 16, allocStep: 0, line: 1 },
      ] }, frames: [],
    });
    expect(model.nodes.every(node => !node.orphaned)).toBe(true);
  });
  it("keeps freed blocks as ghost nodes and preserves dangling arrows", () => {
    const model = renderModel({
      index: 2, line: 4, stdout: "", pointers: [
        { from: "main.dead", to: 4096, label: "dead", dangling: true },
      ],
      heap: [{ address: 4096, fields: { val: "20", next: "NULL" } }],
      memory: { bytes: [], shadows: [], allocations: [{ address: 4096, size: 16, allocStep: 0, freeStep: 2, line: 1 }] },
      frames: [],
    });
    expect(model.nodes[0].freed).toBe(true);
    expect(model.nodes[0].freedAtStep).toBe(2);
    expect(model.arrows).toHaveLength(1);
    expect(model.arrows[0].dangling).toBe(true);
  });
  it("uses arbitrary non-pointer struct field names as node values", () => {
    const model = renderModel({
      index: 0, line: 1, stdout: "", pointers: [{ from: "main.head", to: 4096, label: "head", dangling: false }],
      heap: [{ address: 4096, fields: { data: "42", next: "NULL" } }],
      memory: { bytes: [], shadows: [], allocations: [{ address: 4096, size: 16, allocStep: 0, line: 1, type: "struct node" }] }, frames: [],
    });
    expect(model.nodes[0].value).toBe("42");
    expect(model.nodes[0].fields).toEqual(["data: 42"]);
  });
});

// Zoom cannot recover content outside the SVG viewBox. Check model bounds
// rather than jsdom layout (which cannot measure actual SVG clipping).
it("keeps the default example's freed/orphaned lower row inside the canvas", () => {
  const result = run(samples.requested.code);
  const models = result.trace.steps.map(renderModel);
  expect(models.some(model => model.nodes.some(node => node.y > 105))).toBe(true);
  for (const model of models) {
    for (const node of model.nodes) expect(model.canvasHeight).toBeGreaterThanOrEqual(node.y + 78 + 20);
  }
});
it("expands the canvas for tall stacks instead of clipping later allocations", () => {
  const model = renderModel({
    index: 0, line: 1, stdout: "", frames: [],
    pointers: [{ from: "main.stack", to: 4096, label: "stack", dangling: false }],
    memory: { bytes: [], shadows: [], allocations: Array.from({ length: 8 }, (_, index) => ({
      address: 4096 + index * 16, size: 16, allocStep: 0, line: 1,
    })) },
  });
  expect(model.shape).toBe("stack");
  expect(model.canvasHeight).toBe(1138);
  for (const node of model.nodes) expect(model.canvasHeight).toBeGreaterThanOrEqual(node.y + 98);
});

it("keeps tree-root pointer labels inside the top of the canvas", () => {
  const model = renderModel({
    index: 0, line: 1, stdout: "", frames: [],
    pointers: [
      { from: "main.root", to: 4096, label: "root", dangling: false },
      { from: "0x1000.left", to: 4112, label: "left", dangling: false },
    ],
    memory: { bytes: [], shadows: [], allocations: [4096, 4112].map(address => ({
      address, size: 16, allocStep: 0, line: 1,
    })) },
  });
  expect(model.shape).toBe("tree");
  const root = model.nodes.find(node => node.address === 4096)!;
  const child = model.nodes.find(node => node.address === 4112)!;
  // StructureDiagram draws variable tags 40px above their target node.
  expect(root.y - 40).toBeGreaterThanOrEqual(20);
  expect(child.y - root.y).toBe(140);
  for (const node of model.nodes) expect(model.canvasHeight).toBeGreaterThanOrEqual(node.y + 98);
});

it("keeps dangling-pointer labels clear of the preceding list row", () => {
  const result = run(samples["requested-uaf"].code);
  const model = renderModel(result.trace.steps.at(-1)!);
  const dead = model.arrows.find(arrow => arrow.label === "dead")!;
  expect(dead.dangling).toBe(true);
  const target = model.nodes.find(node => node.address === dead.to)!;
  const preceding = model.nodes.filter(node => node.y < target.y);
  expect(preceding.length).toBeGreaterThan(0);
  // StructureDiagram places the tag 40px above its target. Keep it below
  // the previous 78px node with 20px clearance for strokes and shadows.
  for (const node of preceding) expect(target.y - 40).toBeGreaterThanOrEqual(node.y + 78 + 20);
  expect(model.canvasHeight).toBeGreaterThanOrEqual(target.y + 98);
});

it.each([
  "root->left = child; child->left = child;",
  "root->right = child; child->right = child;",
  "root->left = child; child->right = other; other->left = child;",
  "root->left = child; root->right = child;",
])("renders every snapshot of a cyclic or shared-child tree: %s", links => {
  const result = run(`typedef struct Node { int value; struct Node *left; struct Node *right; } Node;
int main() {
  Node *root = calloc(1, sizeof(Node));
  Node *child = calloc(1, sizeof(Node));
  Node *other = calloc(1, sizeof(Node));
  ${links}
  return 0;
}`);
  expect(result.error).toBeUndefined();
  for (const step of result.trace.steps) {
    const model = renderModel(step);
    expect(Number.isFinite(model.canvasWidth)).toBe(true);
    expect(Number.isFinite(model.canvasHeight)).toBe(true);
    expect(model.nodes).toHaveLength(step.memory.allocations.length);
    for (const node of model.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.y + 78).toBeLessThanOrEqual(model.canvasHeight);
    }
    expect(model.arrows).toEqual((step.pointers ?? []).filter(pointer => model.nodes.some(node => node.address === pointer.to)));
  }
});

it.each([false, true])("separates unplaced tree-cycle nodes (separate rooted component: %s)", withRoot => {
  const addresses = withRoot ? [4096, 4112, 4128, 4144] : [4096, 4112];
  const model = renderModel({
    index: 0, line: 1, stdout: "", frames: [],
    pointers: [
      { from: "main.loop", to: 4096, label: "loop", dangling: false },
      { from: "0x1000.left", to: 4112, label: "left", dangling: false },
      { from: "0x1010.right", to: 4096, label: "right", dangling: false },
      ...(withRoot ? [{ from: "0x1020.left", to: 4144, label: "left", dangling: false }] : []),
    ],
    memory: { bytes: [], shadows: [], allocations: addresses.map(address => ({
      address, size: 16, allocStep: 0, line: 1,
    })) },
  });
  expect(model.shape).toBe("tree");
  expect(model.arrows).toHaveLength(withRoot ? 4 : 3);
  const loop = model.nodes.slice(0, 2);
  expect(Math.abs(loop[0].x - loop[1].x)).toBeGreaterThanOrEqual(146);
  for (const node of loop) {
    expect(node.y - 40).toBeGreaterThanOrEqual(20);
    expect(node.x + 146).toBeLessThanOrEqual(model.canvasWidth);
    expect(node.y + 98).toBeLessThanOrEqual(model.canvasHeight);
    for (const treeNode of model.nodes.slice(2)) {
      expect(node.y - 40).toBeGreaterThanOrEqual(treeNode.y + 98);
    }
  }
});

it("keeps all 100 rootless cycle nodes distinct and within scrollable bounds", () => {
  const addresses = Array.from({ length: 100 }, (_, index) => 4096 + index * 16);
  const model = renderModel({
    index: 0, line: 1, stdout: "", frames: [],
    pointers: addresses.map((address, index) => ({
      from: `0x${address.toString(16)}.left`, to: addresses[(index + 1) % addresses.length], label: "left", dangling: false,
    })),
    memory: { bytes: [], shadows: [], allocations: addresses.map(address => ({
      address, size: 16, allocStep: 0, line: 1,
    })) },
  });
  expect(model.nodes).toHaveLength(100);
  expect(new Set(model.nodes.map(node => node.address)).size).toBe(100);
  expect(new Set(model.nodes.map(node => `${node.x},${node.y}`)).size).toBe(100);
  expect(model.arrows).toHaveLength(100);
  for (const node of model.nodes) {
    expect(node.x).toBeGreaterThanOrEqual(20);
    expect(node.x + 146).toBeLessThanOrEqual(model.canvasWidth);
    expect(node.y - 40).toBeGreaterThanOrEqual(20);
    expect(node.y + 98).toBeLessThanOrEqual(model.canvasHeight);
  }
});

it("preserves rooted-tree horizontal positions while reserving vertical tag clearance", () => {
  const model = renderModel({
    index: 0, line: 1, stdout: "", frames: [],
    pointers: [
      { from: "0x1000.left", to: 4112, label: "left", dangling: false },
      { from: "0x1000.right", to: 4128, label: "right", dangling: false },
    ],
    memory: { bytes: [], shadows: [], allocations: [4096, 4112, 4128].map(address => ({
      address, size: 16, allocStep: 0, line: 1,
    })) },
  });
  expect(model.nodes.map(({ x, y }) => [x, y])).toEqual([[34, 60], [48, 200], [212, 200]]);
});

it.each(["grid", "tree", "singly-linked-list", "stack"] as const)("keeps live and dangling variable tags inside horizontal bounds for %s", shape => {
 for (const dangling of [false, true]) {
  const aliases = Array.from({length:8},(_,i)=>({from:`main.${shape === "stack" ? "top" : "alias"}${i}`,to:4096,label:`alias${i}`,dangling}));
  const edgeLabel = shape === "tree" ? "left" : shape === "singly-linked-list" ? "next" : undefined;
  const model = renderModel({
   index:0,line:1,stdout:"",frames:[],
   pointers:[...aliases, ...(edgeLabel ? [{from:`0x1000.${edgeLabel}`,to:4112,label:edgeLabel,dangling:false}] : [])],
   memory:{bytes:[],shadows:[],allocations:[4096,4112].map(address=>({address,size:16,allocStep:0,line:1}))},
  });
  // Dangling roots intentionally don't select stack shape.
  expect(model.shape).toBe(shape === "stack" && dangling ? "grid" : shape);
  // App renders 72px tags, offset 27px, with 76px between aliases.
  expect(model.canvasWidth).toBeGreaterThanOrEqual(model.nodes[0].x + 27 + 7*76 + 72 + 20);
  expect(model.arrows.filter(arrow=>!arrow.from.startsWith("0x"))).toEqual(aliases);
 }
});
