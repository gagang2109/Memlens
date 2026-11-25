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
it('keeps batch stdin by default and docks optional console in its own pane',()=>{
  expect(container.querySelector('[aria-label="Standard input"]')).not.toBeNull();
  start(); expect(container.querySelector('.terminal-panel .interactive-console')).not.toBeNull();
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
it('toggles a labelled output region without changing its contents',()=>{
  const toggle=()=>container.querySelector<HTMLButtonElement>('.console-output-toggle')!;
  const region=()=>document.getElementById(toggle().getAttribute('aria-controls')!);
  expect(toggle().getAttribute('aria-pressed')).toBe('false');
  expect(region()?.getAttribute('aria-label')).toBe('Program output');
  expect(region()?.tabIndex).toBe(0);
  const initial=output();
  click('.console-output-toggle');
  expect(toggle().getAttribute('aria-pressed')).toBe('true');
  expect(region()?.parentElement?.classList.contains('is-expanded')).toBe(true);
  expect(output()).toBe(initial);
  click('.console-output-toggle');
  expect(toggle().getAttribute('aria-pressed')).toBe('false');
  expect(region()?.parentElement?.classList.contains('is-expanded')).toBe(false);
  expect(output()).toBe(initial);
});
it('keeps the output size when switching mode or restarting interactive input',()=>{
  click('.console-output-toggle'); start();
  expect(container.querySelector('.console-output-toggle')!.getAttribute('aria-pressed')).toBe('true');
  expect(output()).toBe('first: ');
  submit('3');
  click('.run');
  expect(container.querySelector('.console-output-toggle')!.getAttribute('aria-pressed')).toBe('true');
  expect(output()).toBe('first: ');
  expect(document.activeElement?.id).toBe('interactive-input');
  click('.console-output-toggle'); select('Input mode','ahead');
  expect(container.querySelector('.console-output-toggle')!.getAttribute('aria-pressed')).toBe('false');
});
const terminal=()=>container.querySelector<HTMLElement>('#console')!;
const action=(name:string)=>[...terminal().querySelectorAll('button')].find(button=>(button.getAttribute('aria-label')??button.textContent)===name)!;
const press=(button:HTMLElement,key:string)=>act(()=>button.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})));
it('floats, minimizes, restores and docks the same console without losing input or progress',()=>{
  start();submit('3');type('7');
  act(()=>action('Float terminal').click());
  expect(terminal().classList.contains('console-window-floating')).toBe(true);
  expect(document.activeElement).toBe(action('Minimize'));
  act(()=>action('Minimize').click());
  expect(terminal().querySelector<HTMLElement>('.console-window-body')!.hidden).toBe(true);
  expect(document.activeElement).toBe(action('Restore terminal'));
  act(()=>action('Restore terminal').click());
  expect(terminal().querySelector<HTMLElement>('.console-window-body')!.hidden).toBe(false);
  expect(container.querySelector<HTMLInputElement>('#interactive-input')!.value).toBe('7');
  expect(output()).toBe('first: second: ');
  act(()=>action('Dock').click());
  expect(terminal().classList.contains('console-window-docked')).toBe(true);
  expect(document.activeElement).toBe(action('Float terminal'));
  submit('7'); expect(output()).toBe('first: second: sum 10');
});
it('moves and resizes by keyboard and fits the changed viewport',()=>{
  const keys=Object.getOwnPropertyDescriptors(window);
  try {
    Object.defineProperty(window,'innerWidth',{configurable:true,value:900});
    Object.defineProperty(window,'innerHeight',{configurable:true,value:680});
    act(()=>action('Float terminal').click());
    const move=terminal().querySelector<HTMLButtonElement>('[aria-label="Move terminal"]')!;
    const resize=terminal().querySelector<HTMLButtonElement>('[aria-label="Resize terminal"]')!;
    const startLeft=parseFloat(terminal().style.left);
    const startWidth=parseFloat(terminal().style.width);
    press(move,'ArrowLeft'); press(move,'ArrowUp');
    expect(parseFloat(terminal().style.left)).toBe(startLeft-16);
    press(resize,'ArrowRight'); expect(parseFloat(terminal().style.width)).toBe(startWidth+16);
    Object.defineProperty(window,'innerWidth',{configurable:true,value:390});
    Object.defineProperty(window,'innerHeight',{configurable:true,value:650});
    act(()=>window.dispatchEvent(new Event('resize')));
    expect(parseFloat(terminal().style.left)+parseFloat(terminal().style.width)).toBeLessThanOrEqual(382);
    expect(parseFloat(terminal().style.top)+parseFloat(terminal().style.height)).toBeLessThanOrEqual(642);
    expect(parseFloat(terminal().style.left)).toBeGreaterThanOrEqual(8);
  } finally {
    Object.defineProperty(window,'innerWidth',keys.innerWidth!);
    Object.defineProperty(window,'innerHeight',keys.innerHeight!);
  }
});
it('restores a minimized terminal from the console anchor or a new input request',()=>{
  act(()=>action('Float terminal').click());
  act(()=>action('Minimize').click());
  act(()=>terminal().focus());
  expect(terminal().classList.contains('console-window-floating')).toBe(true);
  act(()=>action('Minimize').click());
  const oldWidth=Object.getOwnPropertyDescriptor(window,'innerWidth')!;
  try {
    Object.defineProperty(window,'innerWidth',{configurable:true,value:390});
    start();
    expect(terminal().classList.contains('console-window-floating')).toBe(true);
    expect(parseFloat(terminal().style.left)+parseFloat(terminal().style.width)).toBeLessThanOrEqual(382);
    expect(output()).toBe('first: ');
  } finally {
    Object.defineProperty(window,'innerWidth',oldWidth);
  }
});
it('drags only from the title or move controls, and resizes from the resize grip',()=>{
  act(()=>action('Float terminal').click());
  const fire=(element:HTMLElement,name:string,x:number,y:number)=>act(()=>{
    const event=new MouseEvent(name,{button:0,clientX:x,clientY:y,bubbles:true});
    Object.defineProperty(event,'pointerId',{value:1});
    element.dispatchEvent(event);
  });
  const drag=(element:HTMLElement,dx:number,dy:number)=>{
    element.setPointerCapture=vi.fn();
    element.hasPointerCapture=()=>true;
    element.releasePointerCapture=vi.fn();
    fire(element,'pointerdown',100,100);
    fire(element,'pointermove',100+dx,100+dy);
    fire(element,'pointerup',100+dx,100+dy);
  };
  const initial=parseFloat(terminal().style.left);
  drag(terminal().querySelector<HTMLElement>('[aria-label="Program output"]')!,-40,-40);
  expect(parseFloat(terminal().style.left)).toBe(initial);
  drag(terminal().querySelector<HTMLElement>('.console-window-title')!,-40,-40);
  expect(parseFloat(terminal().style.left)).toBe(initial-40);
  const width=parseFloat(terminal().style.width);
  drag(terminal().querySelector<HTMLElement>('.console-window-resize')!,20,20);
  expect(parseFloat(terminal().style.width)).toBe(width+20);
});
it('reveals the terminal for scanf if a different pane was maximized',()=>{
  click('#code .pane-focus');
  expect(container.querySelector<HTMLElement>('.terminal-panel')!.hidden).toBe(true);
  start();
  expect(container.querySelector<HTMLElement>('.terminal-panel')!.hidden).toBe(false);
  expect(document.activeElement?.id).toBe('interactive-input');
});
