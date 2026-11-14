// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { samples } from '../samples';
import { treeHeightSetup } from './practiceHarness';
vi.mock('./CodeEditor',()=>({CodeEditor:({value}:{value:string})=>createElement('pre',{className:'source'},value)}));
let host:HTMLDivElement;let root:Root;
beforeEach(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();localStorage.setItem('memlens-code','int f(){return 7;}');localStorage.setItem('memlens-test-setup','printf("%d",f());');host=document.body.appendChild(document.createElement('div'));root=createRoot(host);act(()=>root.render(createElement(StrictMode,null,createElement(App))));});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();});
const choose=(key:string)=>act(()=>{const select=host.querySelector<HTMLSelectElement>('[aria-label="Samples"]')!;select.value=key;select.dispatchEvent(new Event('change',{bubbles:true}));});
const source=()=>host.querySelector('.source')!.textContent;
const setup=()=>host.querySelector<HTMLTextAreaElement>('[aria-label="C test setup"]')!.value;
const restore=()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Restore previous draft');
it('lets students restore source and test setup after choosing a sample',()=>{
 choose('tree');expect(source()).toBe(samples.tree.code);expect(setup()).toBe('');
 expect(restore()).toBeDefined();
 act(()=>restore()!.click());
 expect(source()).toBe('int f(){return 7;}');expect(setup()).toBe('printf("%d",f());');
 expect(localStorage.getItem('memlens-code')).toBe('int f(){return 7;}');
 expect(localStorage.getItem('memlens-test-setup')).toBe('printf("%d",f());');
 expect(restore()).toBeUndefined();
});
it('backs up the immediately previous sample including its separate test setup',()=>{
 choose('tree-height');expect(setup()).toBe(treeHeightSetup);
 choose('factorial');expect(setup()).toBe('');
 act(()=>restore()!.click());
 expect(source()).toBe(samples['tree-height'].code);expect(setup()).toBe(treeHeightSetup);
 expect(host.querySelector<HTMLSelectElement>('[aria-label="Samples"]')!.value).toBe('tree-height');
});
it('clears an old trace on sample selection and restoration without auto-running',()=>{
 act(()=>host.querySelector<HTMLButtonElement>('button.run')!.click());
 expect(host.querySelectorAll('.event-tick').length).toBeGreaterThan(0);
 choose('tree');expect(host.querySelectorAll('.event-tick')).toHaveLength(0);
 act(()=>host.querySelector<HTMLButtonElement>('button.run')!.click());
 expect(host.querySelectorAll('.event-tick').length).toBeGreaterThan(0);
 act(()=>restore()!.click());expect(host.querySelectorAll('.event-tick')).toHaveLength(0);
 expect(source()).toBe('int f(){return 7;}');
});
