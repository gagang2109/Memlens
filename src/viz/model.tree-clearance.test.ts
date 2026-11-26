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

it('lays out separate live trees side by side, including room for their aliases', () => {
 const addresses = [4096, 4128, 4160, 4192, 4224];
 const roots = Array.from({length:5},(_,i)=>({from:`main.a${i}`,to:addresses[0],label:`a${i}`,dangling:false}));
 const pointers = [...roots,
  {from:'main.b',to:addresses[2],label:'b',dangling:false},
  {from:'0x1000.left',to:addresses[1],label:'left',dangling:false},
  {from:'0x1040.right',to:addresses[3],label:'right',dangling:false},
 ];
 const model = renderModel({index:0,line:1,stdout:'',frames:[],pointers,
  memory:{bytes:[],shadows:[],allocations:addresses.map(address=>({address,size:16,line:1,allocStep:0}))}});
 const [a,left,b,right,extra] = model.nodes;
 expect(a.y).toBe(b.y);
 expect(left.y).toBe(a.y+140);
 expect(right.y).toBe(b.y+140);
 expect(left.x).toBeLessThan(a.x);
 expect(b.x).toBeLessThan(right.x);
 expect(b.x).toBeGreaterThan(a.x+27+4*76+72);
 expect(extra.y).toBeGreaterThan(right.y);
 expect(model.canvasWidth).toBeGreaterThanOrEqual(right.x+126);
 expect(model.arrows).toEqual(pointers);
});

it('keeps a shared child card unique when two different roots point to it', () => {
 const [a,b,c] = [4096, 4128, 4160];
 const pointers = [
  {from:'main.a',to:a,label:'a',dangling:false},
  {from:'main.b',to:b,label:'b',dangling:false},
  {from:'0x1000.left',to:c,label:'left',dangling:false},
  {from:'0x1020.right',to:c,label:'right',dangling:false},
 ];
 const model = renderModel({index:0,line:1,stdout:'',frames:[],pointers,
  memory:{bytes:[],shadows:[],allocations:[a,b,c].map(address=>({address,size:16,line:1,allocStep:0}))}});
 expect(model.nodes.filter(node=>node.address===c)).toHaveLength(1);
 expect(model.nodes[0].y).toBe(model.nodes[1].y);
 expect(model.nodes[2].y).toBeGreaterThan(model.nodes[0].y);
 expect(model.arrows.filter(arrow=>arrow.to===c)).toHaveLength(2);
});

it('reserves alias space in deeper sibling subtrees and on the disconnected row', () => {
 const addresses = [4096, 4112, 4128, 4144, 4160, 4176, 4192];
 const alias = (label: string, index: number) => ({from:`main.${label}`,label,to:addresses[index],dangling:false});
 const branch = (from: number, label: string, to: number) => ({
  from:`0x${addresses[from].toString(16)}.${label}`,label,to:addresses[to],dangling:false,
 });
 const manyAliases = (index: number) => Array.from({length:5}, (_,i)=>alias(`alias${index}_${i}`, index));
 const pointers = [
  alias('root',0),branch(0,'left',1),branch(0,'right',2),branch(1,'right',3),branch(2,'left',4),
  ...manyAliases(3),alias('rightLeaf',4),...manyAliases(5),alias('extra',6),
 ];
 const model = renderModel({
  index:0,line:1,stdout:'',frames:[],pointers,
  memory:{bytes:[],shadows:[],allocations:addresses.map(address=>({address,size:16,line:1,allocStep:0}))},
 });
 expect(model.shape).toBe('tree');
 for (const [a,b] of [[model.nodes[3],model.nodes[4]],[model.nodes[5],model.nodes[6]]]) {
  expect(a.y).toBe(b.y);
  const lastLeftTagRight = a.x + 27 + 4 * 76 + 72;
  expect(lastLeftTagRight + 16).toBeLessThanOrEqual(b.x + 27);
  expect(model.canvasWidth).toBeGreaterThanOrEqual(b.x+126);
 }
 expect(model.arrows).toEqual(pointers);
});
