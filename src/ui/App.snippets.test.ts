// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
vi.mock('./CodeEditor',()=>({CodeEditor:({value}:{value:string})=>createElement('pre',{className:'source'},value)}));
let container:HTMLDivElement;let root:Root;
beforeEach(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();container=document.body.appendChild(document.createElement('div'));root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();localStorage.clear();});
const mount=(code:string)=>{localStorage.setItem('memlens-code',code);act(()=>root.render(createElement(App)));};
const run=()=>act(()=>container.querySelector<HTMLButtonElement>('button.run')!.click());
it.each(['int square(int n){return n*n;}','','2+3;'])('explains zero-step completion for %j without pretending it has not run',code=>{
  mount(code);run();expect(container.textContent).toContain('0 recorded steps');expect(container.textContent).not.toContain('step 1 of 0');
  expect(container.textContent).toContain('A function definition alone does not call it');
  expect(container.textContent).toContain('Run finished without printed output.');
  expect(container.querySelector<HTMLInputElement>('[aria-label="Timeline"]')!.disabled).toBe(true);
});
it('labels the main-less root as snippet but not a main program',()=>{
  mount('int x=3;');run();expect(container.querySelector('.frame-name')?.textContent).toBe('snippet');
  expect(container.textContent).toContain('Snippet run');
});
it('keeps main frame label for full programs',()=>{
  mount('int main(){int x=3;}');run();expect(container.querySelector('.frame-name')?.textContent).toBe('main()');
  expect(container.textContent).not.toContain('Snippet run');
});
it('offers an explicit snippet sample and clears old run status on selection',()=>{
  mount('int x=3;');run();
  const select=container.querySelector<HTMLSelectElement>('[aria-label="Samples"]')!;
  act(()=>{select.value='snippet';select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(container.textContent).not.toContain('Snippet run');expect(container.querySelector('.source')?.textContent).toContain('int values[]');
  run();expect(container.textContent).toContain('Snippet run');
});
