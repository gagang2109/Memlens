import program from "../../tests/labs/converted-list/rewire.c?raw";
import { expect, it } from "vitest";
import { run } from "../vm/interpreter";
import { convertedList } from "./convertedList";
import { renderConvertedList, renderModel } from "./model";


it("certifies only the completed tree conversion and preserves recorded addresses", () => {
  const result = run(program);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe("2 5 9");
  const tree = result.trace.steps.find(s => s.line === 12 && s.frames.at(-1)?.name === "main")!;
  const completed = result.trace.steps.find(s => s.line === 14 && s.frames.at(-1)?.name === "main")!;
  const [root, head, last] = completed.memory.allocations.map(node => node.address);
  expect(renderModel(tree).shape).toBe("tree");
  expect(renderModel(completed).shape).toBe("tree");
  expect(convertedList(tree, head)).toBeUndefined();
  expect(convertedList(result.trace.goto(completed.index - 1)!, head)).toBeUndefined();
  expect(convertedList(result.trace.goto(completed.index)!, head)).toEqual({
    head, fields: ["lchild","rchild"], addresses: [head,root,last],
  });
  const list = renderConvertedList(completed, renderModel(completed), convertedList(completed, head)!);
  expect(list.nodes.map(node => [node.address, node.value, node.y])).toEqual([[head,"2",105],[root,"5",105],[last,"9",105]]);
  expect(list.nodes.map(node => node.listLinks?.names)).toEqual(Array(3).fill({prev:"lchild",next:"rchild"}));
  expect(list.arrows.filter(a => a.listRole === "prev")).toHaveLength(2);
  expect(list.arrows.filter(a => a.listRole === "next")).toHaveLength(2);
  expect(convertedList(completed, root)).toBeUndefined();
  expect(convertedList(result.trace.steps.at(-1)!, head)).toBeUndefined();
});
