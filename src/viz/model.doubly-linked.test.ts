/// <reference types="vite/client" />
import source from "../../tests/labs/02_doubly_linked_list.c?raw";
import { expect, it } from "vitest";
import { run } from "../vm/interpreter";
import { previousListLink, renderModel } from "./model";

it("uses the real head-to-tail order and keeps both nodes reachable when only the tail remains", () => {
  const result = run(source.replace('printf("%d %d", a->data, a->next->data);', 'a = NULL; printf("%d %d", b->data, b->prev->data);'));
  expect(result.status).toBe("ok");
  expect(result.trace.view?.stdout).toBe("2 1");
  const model = renderModel(result.trace.view!);
  expect(model.shape).toBe("doubly-linked-list");
  const [head, tail] = [...model.nodes].sort((a,b) => a.x-b.x);
  expect([head.value, tail.value]).toEqual(["1", "2"]);
  expect(head.y).toBe(tail.y);
  expect(head.orphaned || tail.orphaned).toBe(false);
  expect(head.listLinks).toEqual({next:tail.label,prev:"NULL"});
  expect(tail.listLinks).toEqual({next:"NULL",prev:head.label});
  expect(model.arrows).toContainEqual({from:"main.b",to:tail.address,label:"b",dangling:false});
  expect(model.arrows).toContainEqual({from:`${tail.label}.prev`,to:head.address,label:"prev",dangling:false});
  expect(previousListLink(tail,head).path).toContain(`M${tail.x} ${tail.y+45}`);
});

it("does not turn a scalar prev equal to a real address into a pointer edge", () => {
  const result = run(`struct Pair { int data, prev; struct Pair *next; };
    int main(void) { struct Pair *a=calloc(1,sizeof(struct Pair)); struct Pair *b=calloc(1,sizeof(struct Pair));
    a->data=2; a->prev=4096; b->next=a; }`);
  expect(result.status).toBe("ok");
  const step = result.trace.view!;
  expect(step.heap?.[0].fields.prev).toBe("4096");
  expect(step.pointers?.some(edge=>edge.label === "prev")).toBe(false);
  expect(renderModel(step).nodes[0].fields).toContain("prev: 4096");
});

it("uses the actual root as the start of a circular list and does not duplicate its nodes", () => {
  const result = run(source.replace('printf("%d %d", a->data, a->next->data);','a->prev=b; b->next=a; a=NULL;'));
  expect(result.status).toBe("ok");
  const model = renderModel(result.trace.view!);
  expect(model.shape).toBe("doubly-linked-list");
  expect([...model.nodes].sort((a,b) => a.x-b.x).map(n=>n.value)).toEqual(["2","1"]);
  expect(model.arrows.filter(edge=>edge.label === "prev")).toHaveLength(2);
  expect(model.nodes.every(node=>!node.orphaned)).toBe(true);
});
