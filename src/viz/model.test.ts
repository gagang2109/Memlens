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
  expect(model.canvasHeight).toBe(685);
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
  expect(child.y - root.y).toBe(92);
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
