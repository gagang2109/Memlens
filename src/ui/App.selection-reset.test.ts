// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {App} from './App';
vi.mock('./CodeEditor',()=>({CodeEditor:()=>null}));
let cleanup:(()=>void)|undefined;
afterEach(()=>{cleanup?.();localStorage.clear();});
function mount(){
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  localStorage.setItem('memlens-code','int main(){int *p=malloc(4);p[0]=7;printf("done");}');
  const container=document.body.appendChild(document.createElement('div'));const root=createRoot(container);
  cleanup=()=>{act(()=>root.unmount());container.remove();};
  act(()=>root.render(createElement(App)));
  const key=(key:string)=>act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})));
  const run=()=>act(()=>container.querySelector<HTMLButtonElement>('button.run')!.click());
  const selectNode=()=>act(()=>container.querySelector('.diagram-node')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  return {container,key,run,selectNode};
}
it('clears a previous trace selection when running again',()=>{
  const {container,key,run,selectNode}=mount();run();key('End');selectNode();
  expect(container.querySelector('.highlighted-node')).not.toBeNull();
  run();key('End');expect(container.querySelector('.highlighted-node')).toBeNull();
});
it('preserves the selected block while stepping within the same trace',()=>{
  const {container,key,run,selectNode}=mount();run();key('End');selectNode();key('ArrowLeft');
  expect(container.querySelector('.highlighted-node')).not.toBeNull();
  key('End');expect(container.querySelector('.highlighted-node')).not.toBeNull();
});
