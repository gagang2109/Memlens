// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { App } from './App';
import { run } from '../vm/interpreter';
vi.mock('./CodeEditor', () => ({ CodeEditor: () => null }));
it.each([
  { name: 'new target', code: 'int main() { int *p = malloc(sizeof(int)); *p = 7; return 0; }', target: 'step', count: 2, label: '(new block)' },
  { name: 'freed target with a distractor', code: 'int main() { int *p = malloc(sizeof(int)); int *q = malloc(sizeof(int)); free(p); return 0; }', target: 'free', count: 3, label: '(freed)' },
])('offers $name when jumping forward in prediction mode', ({ code, target, count, label }) => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem('memlens-code', code);
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  try {
    act(() => root.render(createElement(App)));
    act(() => container.querySelector<HTMLButtonElement>('button.run')!.click());
    act(() => container.querySelector<HTMLInputElement>('.predict-toggle input')!.click());
    const ticks = container.querySelectorAll<HTMLButtonElement>('.event-tick');
    const targetIndex = target === 'free' ? run(code).trace.steps.findIndex(step => step.event === 'free') : 3;
    act(() => ticks[targetIndex].click());
    expect(container.querySelector('.prediction')).not.toBeNull();
    const answers = container.querySelectorAll<HTMLButtonElement>('.prediction button');
    expect(answers.length).toBe(count);
    expect(answers[0].textContent).toBe('NULL');
    expect(answers[1].textContent).toMatch(/^0x/);
    expect(answers[1].textContent).toContain(label);
    act(() => answers[1].click());
    expect(container.querySelector('.correct')?.textContent).toBe('Correct!');
  } finally { act(() => root.unmount()); container.remove(); }
});
