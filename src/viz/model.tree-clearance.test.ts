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

it('draws the textbook tree even when another block was allocated before its root', () => {
 const addresses = Array.from({length:8}, (_,i) => 4096 + i * 16);
 const branch = (from:number, label:string, to:number) => ({
  from: `0x${addresses[from].toString(16)}.${label}`, to:addresses[to], label, dangling:false,
 });
 const pointers = [
  {from:'main.root', to:addresses[1], label:'root', dangling:false},
  branch(1,'left',2), branch(1,'right',3),
  branch(2,'left',4), branch(2,'right',5), branch(3,'left',6), branch(3,'right',7),
 ];
 const model = renderModel({
  index:0,line:1,stdout:'',frames:[],pointers,
  memory:{bytes:[],shadows:[],allocations:addresses.map(address=>({address,size:16,line:1,allocStep:0}))},
 });
 const [extra,root,left,right,...leaves] = model.nodes;
 for (const [parent,a,b] of [[root,left,right],[left,leaves[0],leaves[1]],[right,leaves[2],leaves[3]]]) {
  expect(parent.x).toBe((a.x+b.x)/2);
  expect(a.x).toBeLessThan(parent.x);
  expect(b.x).toBeGreaterThan(parent.x);
  expect(a.y).toBe(parent.y+140);
  expect(a.y).toBe(b.y);
 }
 for(let index=1;index<leaves.length;index++) expect(leaves[index].x-leaves[index-1].x).toBeGreaterThanOrEqual(164);
 expect(extra.y).toBeGreaterThan(leaves[0].y);
 expect(model.arrows).toEqual(pointers);
});

it.each(['left','right'])('places a lone %s child on the correct side', label => {
 const model=renderModel({index:0,line:1,stdout:'',frames:[],pointers:[
  {from:`0x1000.${label}`,to:4112,label,dangling:false},
 ],memory:{bytes:[],shadows:[],allocations:[4096,4112].map(address=>({address,size:16,line:1,allocStep:0}))}});
 const [root,child]=model.nodes;
 expect(child.y).toBeGreaterThan(root.y);
 expect(Math.sign(child.x-root.x)).toBe(label==='left'?-1:1);
});
