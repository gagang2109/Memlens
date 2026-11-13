// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {App} from './App';
vi.mock('./CodeEditor',()=>({CodeEditor:()=>null}));
let cleanup:(()=>void)|undefined;
afterEach(()=>{cleanup?.();localStorage.clear();});
it('shows the faulting helper variables on the error step',()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  localStorage.setItem('memlens-code','int helper(){int local=42;int *p=NULL;return *p;}int main(){helper();}');
  const container=document.body.appendChild(document.createElement('div'));const root=createRoot(container);
  cleanup=()=>{act(()=>root.unmount());container.remove();};
  act(()=>root.render(createElement(App)));
  act(()=>container.querySelector<HTMLButtonElement>('button.run')!.click());
  act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true})));
  expect(container.querySelector('.crime')?.textContent).toContain('null pointer dereference');
  const helper=[...container.querySelectorAll('.frame')].find(frame=>frame.querySelector('.frame-name')?.textContent==='helper()');
  expect(helper?.textContent).toContain('local');
  expect(helper?.textContent).toContain('42');
});
