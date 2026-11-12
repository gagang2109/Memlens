// @vitest-environment jsdom
/// <reference types="vite/client" />
import pageHtml from "../../index.html?raw";
import faviconSvg from "../../public/memlens-favicon.svg?raw";
import markSvg from "../../public/memlens-mark.svg?raw";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { App } from "./App";
vi.mock("./CodeEditor", () => ({ CodeEditor: () => null }));
it("ships a self-contained scalable favicon linked from the document", () => {
  const html = new DOMParser().parseFromString(pageHtml, "text/html");
  const icon = html.querySelector('link[rel="icon"]');
  expect(icon?.getAttribute("href")).toBe("/memlens-favicon.svg");
  expect(icon?.getAttribute("type")).toBe("image/svg+xml");
  for (const source of [markSvg, faviconSvg]) {
    const svg = new DOMParser().parseFromString(source, "image/svg+xml");
    expect(svg.querySelector("parsererror")).toBeNull();
    expect(svg.documentElement.getAttribute("viewBox")).toBe("0 0 64 64");
    expect(svg.querySelector("script, image, foreignObject, use")).toBeNull();
  }
});
it("shows the selected mark beside the readable brand without duplicate accessible text", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    act(() => root.render(createElement(App)));
    const brand = container.querySelector(".brand")!;
    expect(brand.textContent).toContain("MEMLENS");
    const mark = brand.querySelector("img")!;
    expect(mark.getAttribute("src")).toBe("/memlens-mark.svg");
    expect(mark.getAttribute("alt")).toBe("");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.width).toBe(36);
    expect(mark.height).toBe(36);
  } finally { act(() => root.unmount()); }
});
