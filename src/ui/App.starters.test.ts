// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { starterScaffolds } from '../starterScaffolds';
vi.mock('./CodeEditor',()=>({CodeEditor:({value}:{value:string})=>createElement('pre',{className:'source'},value)}));
let host:HTMLDivElement;let root:Root;
beforeEach(()=>{(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();localStorage.setItem('memlens-code','int f(){return 7;}');localStorage.setItem('memlens-test-setup','printf("%d",f());');host=document.body.appendChild(document.createElement('div'));root=createRoot(host);act(()=>root.render(createElement(StrictMode,null,createElement(App))));});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();});
const click=(label:string)=>act(()=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!.click());
const select=(key:string)=>act(()=>{const s=host.querySelector<HTMLSelectElement>('#starter-category')!;s.value=key;s.dispatchEvent(new Event('change',{bubbles:true}));});
const source=()=>host.querySelector('.source')!.textContent;
const setup=()=>host.querySelector<HTMLTextAreaElement>('[aria-label="C test setup"]')!.value;
it('offers editor-adjacent categories independently of Samples without replacing on selection',()=>{
 expect(host.querySelector('.code-panel .starter-scaffolds')).not.toBeNull();
 expect([...host.querySelectorAll('#starter-category option')].map(o=>o.textContent)).toEqual(['Binary tree','Linked list','Stack','Queue','Graph (matrix)','Basic function']);
 select('graph');expect(source()).toBe('int f(){return 7;}');expect(setup()).toBe('printf("%d",f());');
 expect(host.textContent).toContain('not a node-link graph drawing');
});
it('keeps both drafts unchanged when replacement is dismissed or category changes',()=>{
 click('Use starter');click('Cancel');expect(source()).toBe('int f(){return 7;}');expect(setup()).toBe('printf("%d",f());');
 click('Use starter');select('list');expect(host.querySelector('[aria-label="Confirm starter replacement"]')).toBeNull();
 expect(localStorage.getItem('memlens-code')).toBe('int f(){return 7;}');expect(localStorage.getItem('memlens-test-setup')).toBe('printf("%d",f());');
});
it('requires explicit replace, clears setup and trace, and can restore both drafts',()=>{
 click('Run');expect(host.querySelectorAll('.event-tick').length).toBeGreaterThan(0);
 click('Use starter');expect(source()).toBe('int f(){return 7;}');click('Replace source and clear test setup');
 expect(source()).toBe(starterScaffolds.tree.code);expect(setup()).toBe('');expect(host.querySelectorAll('.event-tick')).toHaveLength(0);
 expect(localStorage.getItem('memlens-code')).toBe(starterScaffolds.tree.code);expect(localStorage.getItem('memlens-test-setup')).toBe('');
 click('Restore previous draft');expect(source()).toBe('int f(){return 7;}');expect(setup()).toBe('printf("%d",f());');expect(host.textContent).not.toContain('Restore previous draft');
});
it('loads the chosen scaffold without running and backs up the immediately previous draft',()=>{
 select('function');click('Use starter');click('Replace source and clear test setup');
 expect(source()).toBe(starterScaffolds.function.code);expect(host.querySelectorAll('.event-tick')).toHaveLength(0);
 select('queue');click('Use starter');click('Replace source and clear test setup');expect(source()).toBe(starterScaffolds.queue.code);
 click('Restore previous draft');expect(source()).toBe(starterScaffolds.function.code);expect(setup()).toBe('');
});
