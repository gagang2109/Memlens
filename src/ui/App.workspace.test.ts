// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
vi.mock("./CodeEditor",()=>({CodeEditor:({value}:{value:string})=>createElement("pre",{"data-editor":true},value)}));
let host: HTMLDivElement; let root: Root;
const find = <T extends HTMLElement = HTMLElement>(q: string) => host.querySelector<T>(q)!;
const click = (q:string) => act(()=>find(q).click());
const key = (target: EventTarget, value: string, extra: KeyboardEventInit = {}) => act(()=>target.dispatchEvent(new KeyboardEvent("keydown",{key:value,bubbles:true,cancelable:true,...extra})));
const search = (value:string) => act(()=>{
  const el=find<HTMLInputElement>('.spotlight input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(el,value);
  el.dispatchEvent(new Event("input",{bubbles:true}));
});
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  localStorage.clear(); localStorage.setItem("memlens-code",'int main(){printf("original draft");}');
  host=document.body.appendChild(document.createElement("div")); root=createRoot(host);
  act(()=>root.render(createElement(App)));
});
afterEach(()=>{act(()=>root.unmount()); host.remove(); localStorage.clear();});
it("opens Spotlight with Cmd+K and restores focus on Escape",()=>{
  const prior=find<HTMLInputElement>('[aria-label="Standard input"]'); prior.focus();
  key(prior,"k",{metaKey:true});
  expect(find('[role="dialog"]')).toBeTruthy();
  expect(document.activeElement).toBe(find('.spotlight input'));
  key(find('.spotlight input'),"Escape");
  expect(find('.spotlight')).toBeNull();
  expect(document.activeElement).toBe(prior);
});
it("filters samples and confirms before replacing edited code",()=>{
  const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  try {
    click('.spotlight-trigger'); search('linked queue');
    expect(find('[role="option"]').textContent).toContain('Linked queue');
    key(find('.spotlight input'),'Enter');
    expect(find('.spotlight')).toBeTruthy();
    expect(find('[data-editor]').textContent).toContain('original draft');
    key(find('.spotlight input'),'Enter');
    expect(find<HTMLSelectElement>('[aria-label="Samples"]').value).toBe('queue');
    expect(find('.restore-draft')).toBeNull();
    expect(confirm).toHaveBeenCalledTimes(2);
  } finally { confirm.mockRestore(); }
});
it("runs current code from Spotlight without moving to another sample",()=>{
  click('.spotlight-trigger'); search('run the current'); key(find('.spotlight input'),'Enter');
  expect(find('.timeline .event-tick')).toBeTruthy();
  expect(find('[data-editor]').textContent).toContain('original draft');
});
it("fits and resets the memory view without altering the current step",()=>{
  click('.run');
  const zoom=find('output[aria-label="Visualization zoom"]');
  expect(zoom.textContent).toBe('100%');
  const position=find<HTMLInputElement>('[aria-label="Timeline"]').value;
  click('.spotlight-trigger'); search('fit memory'); key(find('.spotlight input'),'Enter');
  expect(zoom.textContent).toBe('25%');
  click('.spotlight-trigger'); search('reset memory'); key(find('.spotlight input'),'Enter');
  expect(zoom.textContent).toBe('100%');
  expect(find<HTMLInputElement>('[aria-label="Timeline"]').value).toBe(position);
});
it("resizes adjacent desktop panes by keyboard without replacing their contents",()=>{
  const side=find('[aria-label="Resize code and memory"]');
  const end=find('[aria-label="Resize memory and terminal"]');
  const workspace=find('.workspace');
  expect(workspace.style.getPropertyValue('--split-code')).toBe('36fr');
  key(side,'ArrowRight');
  expect(workspace.style.getPropertyValue('--split-code')).toBe('38fr');
  expect(workspace.style.getPropertyValue('--split-memory')).toBe('38fr');
  key(end,'Home');
  expect(workspace.style.getPropertyValue('--split-memory')).toBe('20fr');
  expect(workspace.style.getPropertyValue('--split-console')).toBe('42fr');
  expect(find('[data-editor]').textContent).toContain('original draft');
});
it("focuses a pane and restores the exact split widths, code, and trace",()=>{
  click('.run');
  const workspace=find('.workspace');
  const code=find('[data-editor]').textContent;
  const point=find<HTMLInputElement>('[aria-label="Timeline"]').value;
  key(find('[aria-label="Resize code and memory"]'),'ArrowRight');
  const width=workspace.style.getPropertyValue('--split-code');
  click('#memory .pane-focus');
  expect(workspace.classList.contains('has-focus')).toBe(true);
  expect(find('#code').hidden).toBe(true);
  expect(find('.terminal-panel').hidden).toBe(true);
  key(find('#memory .pane-focus'),'Escape');
  expect(workspace.classList.contains('has-focus')).toBe(false);
  expect(find('#code').hidden).toBe(false);
  expect(workspace.style.getPropertyValue('--split-code')).toBe(width);
  expect(find('[data-editor]').textContent).toBe(code);
  expect(find<HTMLInputElement>('[aria-label="Timeline"]').value).toBe(point);
});
it("maximizes a floating terminal without discarding its position",()=>{
  const trigger=[...find('#console').querySelectorAll('button')].find(b=>b.textContent==='Float terminal')!;
  act(()=>trigger.click());
  const terminal=find('#console');
  const left=terminal.style.left;
  const focus=[...terminal.querySelectorAll('button')].find(b=>b.textContent==='Focus terminal')!;
  act(()=>focus.click());
  expect(terminal.classList.contains('console-window-focused')).toBe(true);
  expect(terminal.style.left).toBe('');
  act(()=>focus.click());
  expect(terminal.classList.contains('console-window-floating')).toBe(true);
  expect(terminal.style.left).toBe(left);
});
it("switches presets without changing source or execution and docks the terminal for Console",()=>{
  const setLayout=(value:string)=>act(()=>{
    const el=find<HTMLSelectElement>('#workspace-layout');
    el.value=value; el.dispatchEvent(new Event('change',{bubbles:true}));
  });
  click('.run');
  const current=find<HTMLInputElement>('[aria-label="Timeline"]').value;
  setLayout('writing');
  expect(find('.workspace').style.getPropertyValue('--split-code')).toBe('56fr');
  setLayout('tracing');
  expect(find('.workspace').style.getPropertyValue('--split-memory')).toBe('56fr');
  const float=[...find('#console').querySelectorAll('button')].find(button=>button.textContent==='Float terminal')!;
  act(()=>float.click());
  expect(find('#console').classList.contains('console-window-floating')).toBe(true);
  setLayout('console');
  expect(find('.workspace').style.getPropertyValue('--split-console')).toBe('50fr');
  expect(find('#console').classList.contains('console-window-docked')).toBe(true);
  expect(find('[data-editor]').textContent).toContain('original draft');
  expect(find<HTMLInputElement>('[aria-label="Timeline"]').value).toBe(current);
});
