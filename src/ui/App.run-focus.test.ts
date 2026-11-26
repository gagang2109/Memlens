// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
let host: HTMLDivElement; let root: Root;
const code = 'int main(){int x=1; x=2; printf("%d",x);}';
beforeEach(() => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); localStorage.setItem('memlens-code', code);
  host = document.body.appendChild(document.createElement('div')); root=createRoot(host);
  act(()=>root.render(createElement(App)));
});
afterEach(()=>{act(()=>root.unmount());host.remove();localStorage.clear();});
function key(target: Element, key: string, extra: KeyboardEventInit = {}) {
  const event=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra});
  act(()=>target.dispatchEvent(event)); return event;
}
const editor=()=>host.querySelector<HTMLElement>('.cm-content')!;
const forward=()=>[...host.querySelectorAll<HTMLButtonElement>('[data-step-navigation]')][1];
const timeline=()=>host.querySelector<HTMLInputElement>('[aria-label="Timeline"]')!;
it('focuses the workspace without scrolling after Run and allows arrows from either step button',()=>{
  const focusSpy=vi.spyOn(HTMLElement.prototype,'focus');
  act(()=>host.querySelector<HTMLButtonElement>('button.run')!.click());
  const buttons=[...host.querySelectorAll<HTMLButtonElement>('[data-step-navigation]')];
  expect(document.activeElement).toBe(host.querySelector("main"));
  expect(focusSpy).toHaveBeenCalledWith({preventScroll:true});focusSpy.mockRestore();
  expect(key(buttons[1],'ArrowRight').defaultPrevented).toBe(true);expect(timeline().value).toBe('1');
  act(()=>buttons[0].focus());key(buttons[0],'ArrowLeft');expect(timeline().value).toBe('0');
  expect(key(buttons[0],' ',{}).defaultPrevented).toBe(false);
  expect(key(buttons[0],'ArrowRight',{ctrlKey:true}).defaultPrevented).toBe(false);
});
it('runs latest editor contents with Ctrl+Enter without inserting a newline',()=>{
  const content=editor(); const view=EditorView.findFromDOM(content)!;
  act(()=>view.focus()); expect(key(content,'Enter',{ctrlKey:true}).defaultPrevented).toBe(true);
  expect(view.state.doc.toString()).toBe(code);expect(document.activeElement).toBe(host.querySelector("main"));
  act(()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'int main(){printf("latest");}'}});view.focus();});
  key(content,'Enter',{ctrlKey:true});expect(document.activeElement).toBe(host.querySelector("main"));
  key(host,'End');expect(host.querySelector('.console pre')!.textContent).toBe('latest');
});
it('keeps focus and native arrows in editor or other controls after returning to them',()=>{
  act(()=>host.querySelector<HTMLButtonElement>('button.run')!.click());
  const content=editor();act(()=>content.focus());key(content,'ArrowRight');expect(timeline().value).toBe('0');
  for(const target of [host.querySelector('[aria-label="Standard input"]')!,host.querySelector('[aria-label="C test setup"]')!]){
    expect(key(target,'ArrowRight').defaultPrevented).toBe(false);expect(timeline().value).toBe('0');
  }
});
it('does not move editor focus to disabled step buttons after a parse error',()=>{
  const content=editor();const view=EditorView.findFromDOM(content)!;
  act(()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'int main( {'}});view.focus();});
  key(content,'Enter',{ctrlKey:true});expect(document.activeElement).toBe(content);
  expect(forward().disabled).toBe(true);
});

it('does not steal focus for empty runs or unrelated modified Enter',()=>{
  const content=editor();const view=EditorView.findFromDOM(content)!;
  act(()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:''}});view.focus();});
  key(content,'Enter',{ctrlKey:true});expect(document.activeElement).toBe(content);expect(forward().disabled).toBe(true);
  expect(key(content,'Enter',{ctrlKey:true,altKey:true}).defaultPrevented).toBe(false);
});

it('runs globally from visualization and starter buttons with current code, including ordinary text inputs, but not menus',()=>{
  const view=EditorView.findFromDOM(editor())!;
  act(()=>view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'int main(){printf("global");}'}}));
  for(const target of [host.querySelector('main')!, host.querySelector('button')!]) {
    expect(key(target,'Enter',{ctrlKey:true}).defaultPrevented).toBe(true);
    expect(timeline().value).toBe('0');key(host,'End');expect(host.querySelector('.console pre')!.textContent).toBe('global');
  }
  for(const target of [host.querySelector('[aria-label="Standard input"]')!, host.querySelector('[aria-label="C test setup"]')!]) {
    expect(key(target,'Enter',{ctrlKey:true}).defaultPrevented).toBe(true);
  }
  expect(key(host.querySelector('[aria-label="Playback speed"]')!,'Enter',{ctrlKey:true}).defaultPrevented).toBe(true);
  const samples=host.querySelector('select')!;
  expect(key(samples,'Enter',{ctrlKey:true}).defaultPrevented).toBe(true);
  expect(key(samples,'ArrowDown').defaultPrevented).toBe(false);
  expect(key(samples,'Enter').defaultPrevented).toBe(false);
  const menu=host.appendChild(document.createElement('div'));menu.setAttribute('role','menu');
  expect(key(menu,'Enter',{ctrlKey:true}).defaultPrevented).toBe(false);
  expect(key(menu,'ArrowRight').defaultPrevented).toBe(false);
  expect(key(host,'Enter',{ctrlKey:true,repeat:true}).defaultPrevented).toBe(false);
});

it('leaves modal dialogs and opt-out console controls alone',()=>{
  for(const attributes of [{role:'dialog'}, {role:'alertdialog'}, {'data-run-shortcut':'ignore'}]) {
    const wrapper=host.appendChild(document.createElement('div'));
    for(const [name,value] of Object.entries(attributes)) wrapper.setAttribute(name,value!);
    const input=wrapper.appendChild(document.createElement('input'));
    expect(key(input,'Enter',{ctrlKey:true}).defaultPrevented).toBe(false);
  }
  const dialog=host.appendChild(document.createElement('dialog'));
  expect(key(dialog,'Enter',{ctrlKey:true}).defaultPrevented).toBe(false);
});

it('runs and plays from the editor with Shift+Enter, but Enter and Ctrl+Enter keep their jobs',()=>{
  const view=EditorView.findFromDOM(editor())!;
  act(()=>view.focus());
  expect(key(editor(),'Enter').defaultPrevented).toBe(true);
  expect(view.state.doc.lines).toBe(2);
  expect(forward().disabled).toBe(true);
  act(()=>view.dispatch({changes:{from:0,to:view.state.doc.length,insert:code}}));

  vi.useFakeTimers();
  try {
    expect(key(editor(),'Enter',{shiftKey:true}).defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe(code);
    expect(timeline().value).toBe('0');
    expect(document.activeElement).toBe(host.querySelector("main"));
    act(()=>vi.advanceTimersByTime(1000));
    expect(timeline().value).toBe('1');
    act(()=>view.focus());
    key(editor(),'Enter',{ctrlKey:true});
    expect(timeline().value).toBe('0');
    act(()=>vi.advanceTimersByTime(1000));
    expect(timeline().value).toBe('0');
  } finally { vi.useRealTimers(); }
});

it('starts completed interactive traces at step zero but leaves waiting traces at the usable prompt',()=>{
  const mode=host.querySelector<HTMLSelectElement>('[aria-label="Input mode"]')!;
  const view=EditorView.findFromDOM(editor())!;
  act(()=>{mode.value='interactive';mode.dispatchEvent(new Event('change',{bubbles:true}));view.focus();});
  vi.useFakeTimers();
  try {
    key(editor(),'Enter',{shiftKey:true});
    expect(timeline().value).toBe('0');
    act(()=>vi.advanceTimersByTime(1000));
    expect(timeline().value).toBe('1');

    act(()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'int main(){int x=0; printf("Value: "); scanf("%d",&x); printf("%d",x);}'}});view.focus();});
    key(editor(),'Enter',{shiftKey:true});
    const input=host.querySelector<HTMLInputElement>('#interactive-input')!;
    expect(timeline().value).toBe(timeline().max);
    expect(input.disabled).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(key(input,'Enter',{shiftKey:true}).defaultPrevented).toBe(false);
    act(()=>vi.advanceTimersByTime(1000));
    expect(timeline().value).toBe(timeline().max);
    expect(input.disabled).toBe(false);
    act(()=> {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'7');
      input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    act(()=>input.closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(host.querySelector('[aria-label="Program output"]')?.textContent).toBe('Value: 7');
  } finally { vi.useRealTimers(); }
});

it('uses normal Predict pauses during Run & Play',()=>{
  const view=EditorView.findFromDOM(editor())!;
  act(()=>view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'int main(){int x=1; int *p=NULL; p=&x; printf("%d",*p);}'}}));
  const toggle=host.querySelector<HTMLInputElement>('.predict-toggle input')!;
  expect(toggle.disabled).toBe(false);
  act(()=>{toggle.click();view.focus();});
  vi.useFakeTimers();
  try {
    key(editor(),'Enter',{shiftKey:true});
    for(let i=0;i<12 && !host.querySelector('.prediction');i++) act(()=>vi.advanceTimersByTime(1000));
    expect(host.querySelector('.prediction')?.textContent).toContain('p');
    const paused=timeline().value;
    act(()=>vi.advanceTimersByTime(3000));
    expect(timeline().value).toBe(paused);
  } finally { vi.useRealTimers(); }
});
