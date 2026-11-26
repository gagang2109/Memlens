// @vitest-environment jsdom
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {SectionNavigation} from './SectionNavigation';
it('offers stable section links and closes mobile menu without replacing the workspace',()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.body.appendChild(document.createElement('div'));const root=createRoot(host);
 act(()=>root.render(createElement(SectionNavigation,{onOpenHelp:()=>{},helpOpen:false})));
 expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe('Workspace sections');
 expect([...host.querySelectorAll('.section-links a')].map(a=>a.getAttribute('href'))).toEqual(['#code','#memory','#console','#trace']);
 const menu=host.querySelector('details')!;menu.open=true;
 act(()=>host.querySelector<HTMLAnchorElement>('.section-menu a')!.click());expect(menu.open).toBe(false);
 expect(host.querySelectorAll('a')).toHaveLength(8);
 act(()=>root.unmount());host.remove();
});

import {App} from './App';
it('keeps section targets unique across input modes without discarding source',()=>{
 localStorage.clear();const host=document.body.appendChild(document.createElement('div'));const root=createRoot(host);
 act(()=>root.render(createElement(App)));
 for(const id of ['code','memory','console','trace'])expect(host.querySelectorAll(`#${id}`)).toHaveLength(1);
 const before=host.querySelector('.cm-content')!.textContent;
 const mode=host.querySelector<HTMLSelectElement>('[aria-label="Input mode"]')!;
 act(()=>{mode.value='interactive';mode.dispatchEvent(new Event('change',{bubbles:true}));});
 for(const id of ['code','memory','console','trace'])expect(host.querySelectorAll(`#${id}`)).toHaveLength(1);
 expect(host.querySelector('#console .interactive-console')).not.toBeNull();
 expect(host.querySelector('.cm-content')!.textContent).toBe(before);
 act(()=>root.unmount());host.remove();localStorage.clear();
});
