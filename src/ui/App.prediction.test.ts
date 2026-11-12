// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { checkPrediction } from "../vm/predict";
vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));
vi.mock("../vm/predict", () => ({
  nextPointerPrediction: () => ({ label: "head", expected: null }),
  checkPrediction: vi.fn((answer: number | null, expected: number | null) => answer === expected),
}));
let container: HTMLDivElement;
let root: Root;
let mounted: boolean;
const click = (selector: string) => act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
const tick = () => act(() => { vi.advanceTimersByTime(500); });
const cursor = () => Number(container.querySelector<HTMLInputElement>('input[aria-label="Timeline"]')!.value);
function askAndAnswer() {
  click('.event-tick:nth-of-type(6)');
  expect(container.querySelector('.prediction')).not.toBeNull();
  click('.prediction button');
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); localStorage.clear();
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container); mounted = true;
  act(() => root.render(createElement(App)));
  click('button.run'); click('.predict-toggle input');
});
afterEach(() => { if (mounted) act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
it("accepts one answer and advances to the requested timeline target", () => {
  askAndAnswer(); click('.prediction button');
  expect(localStorage.getItem('memlens-predict-score')).toBe('1');
  expect(cursor()).toBe(0); tick(); expect(cursor()).toBe(5);
  expect(container.querySelector('.prediction')).toBeNull();
});
it("cancels pending advancement when rerunning", () => {
  askAndAnswer(); click('button.run'); tick(); expect(cursor()).toBe(0);
});
it("cancels pending advancement on sample switch", () => {
  askAndAnswer();
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Samples"]')!;
  act(() => { select.value = 'stack'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  click('button.run'); tick(); expect(cursor()).toBe(0);
});
it("cancels pending advancement when manually navigating back", () => {
  askAndAnswer(); click('.event-tick:nth-of-type(1)'); tick(); expect(cursor()).toBe(0);
});
it("cancels pending advancement when disabling prediction", () => {
  askAndAnswer(); click('.predict-toggle input'); tick(); expect(cursor()).toBe(0);
});
it("cleans up the feedback timer on unmount", () => {
  const schedule = vi.spyOn(window, "setTimeout");
  const cancel = vi.spyOn(window, "clearTimeout");
  askAndAnswer();
  const index = schedule.mock.calls.findIndex(call => call[1] === 500);
  expect(index).toBeGreaterThanOrEqual(0);
  const timer = schedule.mock.results[index].value;
  act(() => root.unmount()); mounted = false;
  expect(cancel).toHaveBeenCalledWith(timer);
});

it("cancels old feedback when selecting another forward target", () => {
  askAndAnswer(); click('.event-tick:nth-of-type(9)'); tick();
  expect(cursor()).toBe(0);
  expect(container.querySelector('.prediction')).not.toBeNull();
  click('.prediction button'); tick(); expect(cursor()).toBe(8);
});
it("shows incorrect feedback once without awarding a point", () => {
  vi.mocked(checkPrediction).mockReturnValueOnce(false);
  askAndAnswer(); click('.prediction button');
  expect(container.querySelector('.incorrect')?.textContent).toBe('Not quite');
  expect(localStorage.getItem('memlens-predict-score')).toBe('0');
  expect(localStorage.getItem('memlens-predict-streak')).toBe('0');
  tick(); expect(cursor()).toBe(5);
});
