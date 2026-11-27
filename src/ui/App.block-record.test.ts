// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { run } from "../vm/interpreter";
import { App } from "./App";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

it("shows the temporary in Call Stack only at the steps where it is in scope", () => {
  const code = `struct Row { char name[4]; int roll; };
int main(void) {
  struct Row rows[2];
  int temp = 99;
  rows[0].roll = 31;
  rows[1].roll = 14;
  {
    struct Row temp = rows[0];
    rows[0] = rows[1];
    rows[1] = temp;
  }
  printf("%d", temp);
  return 0;
}`;
  const result = run(code);
  expect(result.status, result.error?.reason).toBe("ok");
  const duplicate = result.trace.steps.find(step => step.line === 9)!.index;
  const after = result.trace.steps.find(step => step.line === 12)!.index;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  localStorage.setItem("memlens-code", code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const slot = (name: string) => [...host.querySelectorAll(".stack-slot")].find(slot => slot.querySelector("b")?.textContent === name);
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>("button.run")!.click());
    const seek = (index: number) => act(() => host.querySelector<HTMLButtonElement>(`[data-trace-index="${index}"]`)!.click());
    seek(duplicate);
    expect(slot("temp.roll")?.textContent).toContain("31");
    expect(slot("rows[0].roll")?.textContent).toContain("14");
    seek(after);
    expect(slot("temp.roll")).toBeUndefined();
    expect(slot("temp")?.textContent).toContain("99");
    seek(duplicate);
    expect(slot("temp.roll")?.textContent).toContain("31");
    expect(slot("rows[1].roll")?.textContent).toContain("14");
  } finally {
    act(() => root.unmount());
    host.remove();
    localStorage.clear();
  }
});
