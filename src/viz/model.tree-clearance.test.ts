import { expect, it } from 'vitest';
import { run } from '../vm/interpreter';
import { renderModel } from './model';
import { practiceSource, treeHeightCode, treeHeightSetup } from '../ui/practiceHarness';

it('keeps descendant alias tags below preceding tree cards across the height trace', () => {
 const result=run(practiceSource(treeHeightCode,treeHeightSetup).source);
 expect(result.status).toBe('ok'); let tested=0;
 for(const step of result.trace.steps) {
  const model=renderModel(step); if(model.shape!=='tree')continue;
  for(const tag of model.arrows.filter(a=>!a.from.startsWith('0x'))) {
   const node=model.nodes.find(n=>n.address===tag.to)!;
   for(const preceding of model.nodes.filter(n=>n.y<node.y)) {
    expect(node.y-40).toBeGreaterThanOrEqual(preceding.y+78+20);
    tested++;
   }
   expect(node.y+98).toBeLessThanOrEqual(model.canvasHeight);
  }
 }
 expect(tested).toBeGreaterThan(0);
});
it('retains clearance for deeper and disconnected tree nodes', () => {
 const addresses=[4096,4112,4128,4144];
 const model=renderModel({index:0,line:1,stdout:'',frames:[],heap:[],pointers:[
  {from:'0x1000.left',to:4112,label:'left',dangling:false},
  {from:'0x1010.left',to:4128,label:'left',dangling:false},
  ...addresses.map((to,i)=>({from:`main.alias${i}`,to,label:`alias${i}`,dangling:false})),
 ],memory:{bytes:[],shadows:[],allocations:addresses.map(address=>({address,size:16,line:1,allocStep:0}))}});
 for(const node of model.nodes)for(const previous of model.nodes.filter(p=>p.y<node.y))expect(node.y-40).toBeGreaterThanOrEqual(previous.y+98);
});
