import { describe, expect, it } from 'vitest';
import { run } from '../vm/interpreter';
import { renderModel } from './model';

describe('independent heap block layout', () => {
  it('keeps separately allocated data-structure buffers visible', () => {
    const trace = run(`int main() {
      int *values = malloc(12);
      int *links = malloc(12);
      int *visited = malloc(12);
      values[0] = 42; links[0] = 1; visited[0] = 0;
      return 0;
    }`);
    expect(trace.status).toBe("ok");
    const model = renderModel(trace.trace.steps.filter(step => step.memory.allocations.length === 3).at(-1)!);
    expect(model.shape).toBe('grid');
    expect(model.nodes).toHaveLength(3);
    expect(new Set(model.nodes.map(node => `${node.x},${node.y}`)).size).toBe(3);
    for (let i = 1; i < model.nodes.length; i++) {
      expect(model.nodes[i].x - model.nodes[i-1].x).toBeGreaterThanOrEqual(146);
    }
    expect(model.canvasWidth).toBeGreaterThanOrEqual(Math.max(...model.nodes.map(node => node.x + 146)));
  });
  it('wraps a grid without overlapping alias tags and retains dangling aliases', () => {
    const addresses = Array.from({length:7}, (_,i)=>4096+i*16);
    const model = renderModel({index:2,line:1,stdout:'',frames:[], pointers:
      Array.from({length:5},(_,i)=>({from:`main.alias${i}`,to:4096,label:`alias${i}`,dangling:true})),
      memory:{bytes:[],shadows:[],allocations:addresses.map((address,i)=>({address,size:16,allocStep:0,line:1,...(i===0?{freeStep:1}:{})}))}});
    expect(model.nodes[1].x).toBeGreaterThan(model.nodes[0].x + 27 + 4*76 + 72);
    expect(model.nodes[3].y - 40).toBeGreaterThan(model.nodes[0].y + 78);
    expect(model.nodes[6].y).toBeGreaterThan(model.nodes[3].y);
    expect(model.arrows).toHaveLength(5);
    expect(model.nodes[0].freed).toBe(true);
    for (const node of model.nodes) {
      expect(model.canvasWidth).toBeGreaterThanOrEqual(node.x + 146);
      expect(model.canvasHeight).toBeGreaterThanOrEqual(node.y + 98);
    }
  });
  it('leaves space between stacked cards and the following variable labels', () => {
    const model = renderModel({index:0,line:1,stdout:'',frames:[], pointers:[
      {from:'main.stack',to:4096,label:'stack',dangling:false},
      {from:'main.other',to:4112,label:'other',dangling:false},
    ], memory:{bytes:[],shadows:[],allocations:[4096,4112].map(address=>({address,size:16,allocStep:0,line:1}))}});
    expect(model.shape).toBe('stack');
    expect(model.nodes[1].y - 40).toBeGreaterThan(model.nodes[0].y + 78);
  });
});
