// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { App } from './App';
import { run } from '../vm/interpreter';
vi.mock('./CodeEditor', () => ({ CodeEditor: () => null }));
it('awards the NULL answer for a real numeric-zero pointer assignment', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const code = 'int main() { int *p = malloc(4); p = 0; }';
  localStorage.clear(); localStorage.setItem('memlens-code', code);
  const index = run(code).trace.steps.findIndex(s => s.pointers?.some(p => p.from === 'main.p' && p.to === 0));
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  try {
    act(() => root.render(createElement(App)));
    act(() => container.querySelector<HTMLButtonElement>('button.run')!.click());
    act(() => container.querySelectorAll<HTMLButtonElement>('.event-tick')[index - 1].click());
    act(() => container.querySelector<HTMLInputElement>('.predict-toggle input')!.click());
    act(() => container.querySelectorAll<HTMLButtonElement>('.event-tick')[index].click());
    const answer = container.querySelector<HTMLButtonElement>('.prediction button')!;
    expect(answer.textContent).toBe('NULL');
    act(() => answer.click());
    expect(container.querySelector('.correct')?.textContent).toBe('Correct!');
    expect(localStorage.getItem('memlens-predict-score')).toBe('1');
  } finally { act(() => root.unmount()); container.remove(); localStorage.clear(); }
});
