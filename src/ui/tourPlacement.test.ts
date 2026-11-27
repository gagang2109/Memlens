import { describe, expect, it } from "vitest";
import { placeTourCard, type TourRect } from "./tourPlacement";

const rect = (left: number, top: number, right: number, bottom: number): TourRect =>
  ({ left, top, right, bottom });
const desktop = { width: 1024, height: 720 };
const popup = { width: 220, height: 120 };
const box = (p: { left: number; top: number }, { width, height } = popup) =>
  rect(p.left, p.top, p.left + width, p.top + height);
const area = (a: TourRect, b: TourRect) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

describe("measured tour card placement", () => {
  it("places the default card below the anchor with the arrow centered on it", () => {
    expect(placeTourCard(rect(400, 100, 500, 140), popup, desktop))
      .toEqual({ left: 340, top: 156, side: "bottom", arrow: 110 });
  });

  it("chooses a different side rather than covering the source editor", () => {
    const run = rect(24, 52, 140, 92);
    const editor = rect(0, 102, 560, 680);
    const result = placeTourCard(run, popup, desktop, [editor]);
    expect(result.side).toBe("right");
    expect(area(box(result), editor)).toBe(0);
    expect(area(box(result), run)).toBe(0);
    expect(result.top + result.arrow).toBe(72);
  });

  it("slides along a side where centered placement would obscure protected content", () => {
    const anchor = rect(250, 475, 525, 510);
    const code = rect(0, 180, 340, 475);
    const console = rect(510, 180, 800, 475);
    const result = placeTourCard(anchor, { width: 150, height: 160 }, { width: 800, height: 520 }, [code, console]);
    expect(result.side).toBe("top");
    expect(result.left).toBeGreaterThanOrEqual(340);
    expect(result.left + 150).toBeLessThanOrEqual(510);
    expect(result.left + result.arrow).toBeGreaterThanOrEqual(anchor.left);
    expect(result.left + result.arrow).toBeLessThanOrEqual(anchor.right);
  });

  it("uses only the visible portion of an anchor partly beyond an edge", () => {
    const result = placeTourCard(rect(1015, 200, 1070, 250), popup, desktop);
    expect(result.side).toBe("left");
    expect(result.left + popup.width).toBeLessThan(1015);
    expect(result.top + result.arrow).toBe(225);
  });

  it("does not cover the anchor on a narrow viewport when only a flush fit is possible", () => {
    const phone = { width: 320, height: 470 };
    const card = { width: 300, height: 225 };
    const anchor = rect(0, 225, 320, 245);
    const result = placeTourCard(anchor, card, phone);
    expect(result.side).toBe("none");
    expect(area(box(result, card), anchor)).toBe(0);
    expect(result.left).toBeGreaterThanOrEqual(0);
    expect(result.top).toBeGreaterThanOrEqual(0);
    expect(result.left + card.width).toBeLessThanOrEqual(phone.width);
    expect(result.top + card.height).toBeLessThanOrEqual(phone.height);
  });

  it("protects the anchor ahead of another region when both cannot stay clear", () => {
    const phone = { width: 320, height: 640 };
    const card = { width: 290, height: 240 };
    const anchor = rect(0, 30, 320, 100);
    const editor = rect(0, 110, 320, 640);
    const result = placeTourCard(anchor, card, phone, [editor]);
    expect(area(box(result, card), anchor)).toBe(0);
    expect(area(box(result, card), editor)).toBeLessThan(290 * 240);
  });

  it("keeps an oversized card anchored to the viewport for CSS sizing and hides arrows for missing targets", () => {
    const result = placeTourCard(rect(-70, -100, -30, -50),
      { width: 900, height: 900 }, { width: 320, height: 570 });
    expect(result).toEqual({ left: 0, top: 0, side: "none", arrow: 0 });
  });

  it("does not interpret the offscreen area of a code rectangle as protection", () => {
    expect(placeTourCard(rect(400, 100, 500, 140), popup, desktop, [rect(0, 900, 900, 1200)]))
      .toEqual(placeTourCard(rect(400, 100, 500, 140), popup, desktop));
  });
});
