// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, expect, it } from 'vitest';
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
it('focuses step forward after Run and allows arrows from either step button',()=>{
  act(()=>host.querySelector<HTMLButtonElement>('button.run')!.click());
  const buttons=[...host.querySelectorAll<HTMLButtonElement>('[data-step-navigation]')];
  expect(document.activeElement).toBe(buttons[1]);
  expect(key(buttons[1],'ArrowRight').defaultPrevented).toBe(true);expect(timeline().value).toBe('1');
  act(()=>buttons[0].focus());key(buttons[0],'ArrowLeft');expect(timeline().value).toBe('0');
  expect(key(buttons[0],' ',{}).defaultPrevented).toBe(false);
  expect(key(buttons[0],'ArrowRight',{ctrlKey:true}).defaultPrevented).toBe(false);
});
it('runs latest editor contents with Ctrl+Enter without inserting a newline',()=>{
  const content=editor(); const view=EditorView.findFromDOM(content)!;
  act(()=>view.focus()); expect(key(content,'Enter',{ctrlKey:true}).defaultPrevented).toBe(true);
  expect(view.state.doc.toString()).toBe(code);expect(document.activeElement).toBe(forward());
  act(()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'int main(){printf("latest");}'}});view.focus();});
  key(content,'Enter',{ctrlKey:true});expect(document.activeElement).toBe(forward());
  key(host,'End');expect(host.querySelector('.console pre')!.textContent).toBe('latest');
});
it('keeps focus and native arrows in editor or other controls after returning to them',()=>{
  act(()=>host.querySelector<HTMLButtonElement>('button.run')!.click());
  const content=editor();act(()=>content.focus());key(content,'ArrowRight');expect(timeline().value).toBe('0');
  for(const target of [host.querySelector('[aria-label="Standard input"]')!,host.querySelector('[aria-label="Playback speed"]')!,host.querySelector('[aria-label="C test setup"]')!]){
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
