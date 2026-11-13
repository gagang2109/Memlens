// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
vi.mock('./CodeEditor',()=>({CodeEditor:({value,currentLine}:{value:string;currentLine?:number})=>createElement('pre',{className:'source','data-line':currentLine},value)}));
let host:HTMLDivElement; let root:Root;
beforeEach(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();host=document.body.appendChild(document.createElement('div'));root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();});
const mount=(code:string,setup='')=>{localStorage.setItem('memlens-code',code);localStorage.setItem('memlens-test-setup',setup);act(()=>root.render(createElement(StrictMode,null,createElement(App))));};
const run=()=>act(()=>host.querySelector<HTMLButtonElement>('button.run')!.click());
const last=()=>act(()=>{const ticks=host.querySelectorAll<HTMLButtonElement>('.event-tick');ticks[ticks.length-1]?.click();});
it('keeps user source separate and identifies setup trace/error lines',()=>{
 mount('int f(){return 7;}','int *p=NULL;\nprintf("%d",*p);');run();last();
 expect(host.querySelector('.source')?.textContent).toBe('int f(){return 7;}');
 expect(host.textContent).toContain('test setup line 2');expect(host.querySelector('.source')?.getAttribute('data-line')).toBeNull();
 expect(host.textContent).not.toContain('source test setup');
});
it('restores setup separately under StrictMode',()=>{
 mount('int f(){return 7;}','printf("%d",f());');
 expect(host.querySelector<HTMLTextAreaElement>('[aria-label="C test setup"]')!.value).toBe('printf("%d",f());');
 expect(localStorage.getItem('memlens-code')).toBe('int f(){return 7;}');run();last();expect(host.querySelector('.console pre')?.textContent).toBe('7');
});
it('does not execute main and setup together',()=>{mount('int main(){printf("main");}','printf("setup");');run();expect(host.textContent).toContain('Clear test setup');expect(host.querySelectorAll('.event-tick')).toHaveLength(0);});
it('loads the explicit tree example only on sample selection and clears setup for other samples',()=>{
 mount('int mine=3;','int keep=4;'); const select=host.querySelector<HTMLSelectElement>('[aria-label="Samples"]')!;
 act(()=>{select.value='tree-height';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.querySelector('.source')?.textContent).toContain('int height');
 expect(host.querySelector<HTMLTextAreaElement>('[aria-label="C test setup"]')!.value).toContain('height(root)');run();last();expect(host.querySelector('.console pre')?.textContent).toBe('Height: 2');
 act(()=>{select.value='factorial';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(host.querySelector<HTMLTextAreaElement>('[aria-label="C test setup"]')!.value).toBe('');
});
