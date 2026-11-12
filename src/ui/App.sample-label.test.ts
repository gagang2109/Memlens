// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { samples } from "../samples";
vi.mock("./CodeEditor", () => ({ CodeEditor: ({ value, onChange }: { value: string; onChange: (code: string) => void }) => createElement("div", {}, createElement("pre", { className: "source" }, value), createElement("button", { className: "edit", onClick: () => onChange(value + "\n") }, "Edit"), createElement("button", { className: "restore", onClick: () => onChange(samples.tree.code) }, "Restore")) }));
let container: HTMLDivElement; let root: Root;
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear(); container = document.body.appendChild(document.createElement("div")); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.clear(); });
const select = () => container.querySelector<HTMLSelectElement>('select[aria-label="Samples"]')!;
const mount = () => act(() => root.render(createElement(App)));
function choose(value: string) { act(() => { select().value = value; select().dispatchEvent(new Event("change", { bubbles: true })); }); }
it("labels restored preset source accurately without overwriting it", () => { localStorage.setItem("memlens-code", samples.tree.code); mount(); expect(select().value).toBe("tree"); expect(localStorage.getItem("memlens-code")).toBe(samples.tree.code); });
it("labels restored custom source and replaces it only when choosing a preset", () => { const custom = "int main() { return 42; }"; localStorage.setItem("memlens-code", custom); mount(); expect(select().selectedOptions[0].textContent).toContain("Custom"); expect(container.querySelector('.source')?.textContent).toBe(custom); choose("queue"); expect(select().value).toBe("queue"); expect(container.querySelector('.source')?.textContent).toBe(samples.queue.code); });
it("shows Custom after editing and recognizes an exact restored preset", () => { mount(); choose("tree"); act(() => container.querySelector<HTMLButtonElement>('.edit')!.click()); expect(select().value).toBe("custom"); act(() => container.querySelector<HTMLButtonElement>('.restore')!.click()); expect(select().value).toBe("tree"); });
it("preserves the user's explicitly selected alias for identical preset code", () => { mount(); choose("requested-uaf"); expect(select().value).toBe("requested-uaf"); expect(container.querySelector('.source')?.textContent).toBe(samples["requested-uaf"].code); });
