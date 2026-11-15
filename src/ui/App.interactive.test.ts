// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
vi.mock("./CodeEditor", () => ({ CodeEditor: ({ onChange }: { onChange: (code: string) => void }) => createElement("button", { className: "edit-code", onClick: () => onChange('int main(){printf("edited");}') }, "Edit") }));
let container: HTMLDivElement; let root: Root;
const source='int main(){int a;int b;printf("first: ");scanf("%d",&a);printf("second: ");scanf("%d",&b);printf("sum %d",a+b);}';
beforeEach(()=>{
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
  localStorage.clear(); localStorage.setItem("memlens-code",source);
  container=document.body.appendChild(document.createElement("div")); root=createRoot(container);
  act(()=>root.render(createElement(App)));
});
afterEach(()=>{act(()=>root.unmount());container.remove();localStorage.clear();});
const click=(selector:string)=>act(()=>container.querySelector<HTMLButtonElement>(selector)!.click());
const select=(label:string,value:string)=>act(()=>{const el=container.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;el.value=value;el.dispatchEvent(new Event("change",{bubbles:true}));});
const type=(value:string)=>act(()=>{const el=container.querySelector<HTMLInputElement>('#interactive-input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
const submit=(value:string)=>{type(value);act(()=>container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));};
const output=()=>container.querySelector('[aria-label="Program output"]')!.textContent;
const start=()=>{select('Input mode','interactive');click('.run');};
it('keeps batch stdin by default and docks optional console beside memory',()=>{
  expect(container.querySelector('[aria-label="Standard input"]')).not.toBeNull();
  start(); expect(container.querySelector('.code-panel .interactive-console')).not.toBeNull();
  expect(container.querySelector('.memory-panel')).not.toBeNull(); expect(output()).toBe('first: ');
  expect(document.activeElement?.id).toBe('interactive-input');
  expect(container.querySelector('#memory #trace .waiting-console-link')?.getAttribute('href')).toBe('#console');
  submit('3'); expect(output()).toBe('first: second: ');
  submit('7'); expect(output()).toBe('first: second: sum 10');
  expect(container.querySelector<HTMLInputElement>('#interactive-input')!.disabled).toBe(true);
  expect(container.querySelector('.console-state')!.textContent).toBe('Run finished');
  expect(container.querySelector('.waiting-console-link')).toBeNull();
});
it('blocks input while viewing old snapshots and never resubmits through arrows',()=>{
  start();submit('4');const count=container.querySelectorAll('.event-tick').length;
  click('.controls button:nth-child(2)');
  expect(container.querySelector<HTMLInputElement>('#interactive-input')!.disabled).toBe(true);
  const latest=[...container.querySelectorAll('button')].find(b=>b.textContent==='Return to waiting step')!;
  act(()=>latest.click());expect(output()).toBe('first: second: ');
  expect(container.querySelectorAll('.event-tick').length).toBe(count);
  submit('6');expect(output()).toBe('first: second: sum 10');
});
it('supports collapse, explicit EOF, restart and stop',()=>{
  start();click('.console-heading');expect(container.querySelector('form')).toBeNull();
  click('.console-heading');expect(container.querySelector('form')).not.toBeNull();
  const eof=[...container.querySelectorAll('button')].find(b=>b.textContent==='Send EOF')!;
  act(()=>eof.click());expect(container.querySelector('.console-state')!.textContent).toBe('Run finished');
  click('.run');expect(output()).toBe('first: ');
  const stop=[...container.querySelectorAll('button')].find(b=>b.textContent==='Stop interactive run')!;
  act(()=>stop.click());expect(container.querySelector<HTMLInputElement>('#interactive-input')!.disabled).toBe(true);
  expect(container.querySelector('.interactive-console [role="alert"]')!.textContent).toContain('Stopped');
  click('.run');submit('1');submit('2');expect(output()).toContain('sum 3');
});
it('invalidates input after edits and starts clean after sample replacement',()=>{
  start();click('.edit-code');expect(container.querySelector<HTMLInputElement>('#interactive-input')!.disabled).toBe(true);
  click('.run');expect(output()).toBe('edited');
  select('Samples','factorial');expect(container.querySelector<HTMLInputElement>('#interactive-input')!.disabled).toBe(true);
  expect(container.querySelector('.interactive-console details pre')!.textContent).toBe('No lines submitted.');
});
it('retains input-ahead content when switching modes without consuming it',()=>{
  start(); select('Input mode','ahead');expect(container.querySelector('[aria-label="Standard input"]')).not.toBeNull();
  select('Input mode','interactive');submit('2');submit('5');expect(output()).toContain('sum 7');
});
it('repeated Run resets unsent input and reopens a collapsed waiting console',()=>{
  start();type('unsent');click('.console-heading');expect(container.querySelector('form')).toBeNull();
  click('.run');expect(container.querySelector('form')).not.toBeNull();
  expect(container.querySelector<HTMLInputElement>('#interactive-input')!.value).toBe('');
  expect(document.activeElement?.id).toBe('interactive-input');expect(output()).toBe('first: ');
});
it('global Run uses latest input mode but cannot restart from console input',()=>{
  select('Input mode','interactive');
  act(()=>container.querySelector('main')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true})));
  expect(output()).toBe('first: ');submit('2');
  act(()=>container.querySelector('#interactive-input')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true})));
  expect(output()).toBe('first: second: ');submit('5');expect(output()).toContain('sum 7');
});
