// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { samples } from '../samples';
vi.mock('./CodeEditor',()=>({CodeEditor:({value,onChange}:{value:string;onChange:(value:string)=>void})=>createElement('div',{},createElement('pre',{className:'source'},value),createElement('button',{className:'clear-code',onClick:()=>onChange('')},'Clear'))}));
let container:HTMLDivElement;let root:Root;
beforeEach(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();container=document.body.appendChild(document.createElement('div'));root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.restoreAllMocks();localStorage.clear();});
const mount=()=>act(()=>root.render(createElement(App)));
it('restores an intentionally empty saved draft rather than replacing it with a sample',()=>{
  localStorage.setItem('memlens-code','');mount();
  expect(container.querySelector('.source')?.textContent).toBe('');
  expect(localStorage.getItem('memlens-code')).toBe('');
  expect(container.querySelector<HTMLSelectElement>('select[aria-label="Samples"]')?.value).toBe('custom');
});
it('still loads the initial sample when no draft is saved',()=>{
  mount();expect(container.querySelector('.source')?.textContent).toBe(samples.requested.code);
});
it('preserves clear-editor intent across a remount',()=>{
  mount();act(()=>container.querySelector<HTMLButtonElement>('.clear-code')!.click());
  expect(localStorage.getItem('memlens-code')).toBe('');
  act(()=>root.unmount());root=createRoot(container);mount();
  expect(container.querySelector('.source')?.textContent).toBe('');
});

it.each(['','int main(){return 42;}'])('preserves saved draft %j during StrictMode mount replay',saved=>{
  localStorage.setItem('memlens-code',saved);
  const writes=vi.spyOn(Storage.prototype,'setItem');
  act(()=>root.render(createElement(StrictMode,null,createElement(App))));
  expect(container.querySelector('.source')?.textContent).toBe(saved);
  expect(localStorage.getItem('memlens-code')).toBe(saved);
  expect(writes.mock.calls.filter(([key])=>key==='memlens-code').every(([,value])=>value===saved)).toBe(true);
});
it('stays usable when storage reads and writes are unavailable under StrictMode',()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
  act(()=>root.render(createElement(StrictMode,null,createElement(App))));
  expect(container.querySelector('.source')?.textContent).toBe(samples.requested.code);
  act(()=>container.querySelector<HTMLButtonElement>('.clear-code')!.click());
  expect(container.querySelector('.source')?.textContent).toBe('');
});
