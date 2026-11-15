// @vitest-environment jsdom
import {createElement,act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {SectionNavigation} from './SectionNavigation';
it('offers stable section links and closes mobile menu without replacing the workspace',()=>{
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.body.appendChild(document.createElement('div'));const root=createRoot(host);
 act(()=>root.render(createElement(SectionNavigation)));
 expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe('Workspace sections');
 expect([...host.querySelectorAll('.section-links a')].map(a=>a.getAttribute('href'))).toEqual(['#code','#memory','#console','#trace']);
 const menu=host.querySelector('details')!;menu.open=true;
 act(()=>host.querySelector<HTMLAnchorElement>('.section-menu a')!.click());expect(menu.open).toBe(false);
 expect(host.querySelectorAll('a')).toHaveLength(8);
 act(()=>root.unmount());host.remove();
});
