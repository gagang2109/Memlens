import { expect, it } from "vitest";
import { readGraph, graphSize } from "./graph";

it("does not collapse directed reciprocal edges and retains self-loops and weights", () => {
  const matrix = {base:1, dimensions:[2, 2], cells:[4, -2, 3, 0]};
  const graph = readGraph(matrix, true);
  expect(graph).toEqual({size:2, directed:true, edges:[
    {from:0,to:0,weight:4,paired:false},
    {from:0,to:1,weight:-2,paired:true},
    {from:1,to:0,weight:3,paired:true},
  ]});
  expect(readGraph({...matrix, cells:[4, -2, -2, 0]}, true)).toEqual({size:2, directed:false, edges:[
    {from:0,to:0,weight:4,paired:false},
    {from:0,to:1,weight:-2,paired:false},
  ]});
});
it("rejects rectangular, oversized or nonnumeric arrays", () => {
  expect(graphSize({base:1, dimensions:[1, 2], cells:[0, 1]})).toBe(0);
  expect(graphSize({base:1, dimensions:[17, 17], cells:Array(289).fill(0)})).toBe(0);
  expect(graphSize({base:1, dimensions:[1, 1], cells:["a"]})).toBe(0);
});
