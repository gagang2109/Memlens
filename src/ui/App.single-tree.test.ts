// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { samples } from "../samples";
import { run } from "../vm/interpreter";
import { App } from "./App";

vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));

it.each([false, true])("shows the first BST node and its real NULL children while stepping (with buffer: %s)", withBuffer => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const code = withBuffer ? samples.tree.code.replace("int main() {", "int main() {\n    int *buffer = malloc(4);\n    *buffer = 17;") : samples.tree.code;
  const result = run(code);
  expect(result.status).toBe("ok");
  const { steps } = result.trace;
  const rootAddress = steps.find(s => s.frames[0]?.variables?.root?.value !== undefined && s.frames[0].variables?.root?.value !== "null")?.frames[0].variables?.root?.value;
  const address = Number(rootAddress);
  const rootLabel = `0x${address.toString(16)}`;
  const singleton = steps.findIndex(s => s.frames[0]?.variables?.root?.value === rootAddress && s.heap?.some(n => n.address === address && n.fields.left === "null" && n.fields.right === "null"));
  const withChild = steps.findIndex(s => s.pointers?.some(edge => edge.from === `${rootLabel}.left` && edge.to > 0));
  expect(singleton).toBeGreaterThan(0);
  expect(withChild).toBeGreaterThan(singleton);
  localStorage.clear();
  localStorage.setItem("memlens-code",code);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const seek = (i: number) => act(() => host.querySelectorAll<HTMLButtonElement>(".event-tick")[i].click());
  const diagram = () => host.querySelector('[aria-label="tree visualization"]');
  const rootCard = () => Array.from(diagram()!.querySelectorAll(".diagram-node")).find(card => card.textContent?.includes(`@ ${rootLabel}`))!;
  try {
    act(() => root.render(createElement(App)));
    act(() => host.querySelector<HTMLButtonElement>(".run")!.click());
    seek(0);
    expect(diagram()).toBeNull();
    seek(singleton);
    expect(rootCard().textContent).toContain("left → NULL");
    expect(rootCard().textContent).toContain("right → NULL");
    expect(rootCard().querySelectorAll("circle.null-stub")).toHaveLength(2);
    expect(diagram()!.querySelectorAll("circle.null-stub")).toHaveLength(2);
    if (withBuffer) {
      const buffer = Array.from(diagram()!.querySelectorAll(".diagram-node")).find(card => card.textContent?.includes("raw block"))!;
      expect(buffer).toBeTruthy();
      expect(buffer.textContent).not.toMatch(/left →|right →/);
      expect(buffer.querySelector("circle.null-stub")).toBeNull();
    }
    seek(withChild);
    expect(rootCard().textContent).toMatch(/left → 0x[0-9a-f]+/);
    expect(rootCard().querySelectorAll("circle.null-stub")).toHaveLength(1);
    seek(singleton);
    expect(rootCard().querySelectorAll("circle.null-stub")).toHaveLength(2);
  } finally { act(() => root.unmount()); host.remove(); localStorage.clear(); }
});
