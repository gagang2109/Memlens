export type TourRect = { left: number; top: number; right: number; bottom: number };
type Size = { width: number; height: number };
type Side = "top" | "bottom" | "left" | "right";
type Placement = { left: number; top: number; side: Side | "none"; arrow: number };

const margin = 12;
const gap = 16;
const minArrowGap = 8;
const pointerInset = 16;
const sides = ["bottom", "right", "top", "left"] as const;

const finite = (n: number) => Number.isFinite(n) ? n : 0;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));
const overlap = (a: TourRect, b: TourRect) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

function clip(rect: TourRect, width: number, height: number): TourRect | undefined {
  const left = clamp(finite(rect.left), 0, width), right = clamp(finite(rect.right), 0, width);
  const top = clamp(finite(rect.top), 0, height), bottom = clamp(finite(rect.bottom), 0, height);
  return left < right && top < bottom ? { left, right, top, bottom } : undefined;
}

function axisPositions(max: number, size: number, center: number, edges: number[]) {
  const padding = Math.min(margin, max / 2);
  // Contact positions and side gaps cover the extrema of each overlap region.
  return [...new Set([
    0, max, padding, max - padding, center - size / 2,
    ...edges.flatMap(edge => [
      edge, edge - size,
      edge + gap, edge - size - gap,
      edge + minArrowGap, edge - size - minArrowGap,
      edge - Math.min(pointerInset, size / 2),
      edge - size + Math.min(pointerInset, size / 2),
    ]),
  ].map(value => clamp(value, 0, max)))];
}

function pointer(side: Side, card: TourRect, anchor: TourRect) {
  const vertical = side === "top" || side === "bottom";
  const distance = side === "bottom" ? card.top - anchor.bottom :
    side === "right" ? card.left - anchor.right :
    side === "top" ? anchor.top - card.bottom : anchor.left - card.right;
  if (distance < minArrowGap) return;
  const edgeStart = vertical ? card.left : card.top;
  const edgeEnd = vertical ? card.right : card.bottom;
  const targetStart = vertical ? anchor.left : anchor.top;
  const targetEnd = vertical ? anchor.right : anchor.bottom;
  const inset = Math.min(pointerInset, (edgeEnd - edgeStart) / 2);
  const min = Math.max(targetStart, edgeStart + inset);
  const max = Math.min(targetEnd, edgeEnd - inset);
  if (min > max) return;
  const targetCenter = (targetStart + targetEnd) / 2;
  const point = clamp(targetCenter, min, max);
  return {
    arrow: point - edgeStart,
    distance,
    offset: Math.abs(targetCenter - (edgeStart + edgeEnd) / 2),
  };
}

function compare(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 0.000001) return a[i] - b[i];
  }
  return 0;
}

/**
 * Place a measured, fixed-position tour card in CSS pixels. The arrow offset
 * is relative to the card along the edge facing the anchor (x for top/bottom).
 * Oversized dimensions are modeled as viewport-sized; the card itself should
 * use CSS max dimensions and overflow scrolling so its measured box can fit.
 */
export function placeTourCard(anchor: TourRect, card: Size, viewport: Size, protectedRects: TourRect[] = []): Placement {
  const width = Math.max(0, finite(viewport.width)), height = Math.max(0, finite(viewport.height));
  const w = clamp(finite(card.width), 0, width), h = clamp(finite(card.height), 0, height);
  if (w === 0 || h === 0) return { left: 0, top: 0, side: "none", arrow: 0 };

  const target = clip(anchor, width, height);
  const guards = protectedRects.flatMap(rect => clip(rect, width, height) ?? []);
  const regions = target ? [target, ...guards] : guards;
  const cx = target ? (target.left + target.right) / 2 : width / 2;
  const cy = target ? (target.top + target.bottom) / 2 : height / 2;
  const xs = axisPositions(width - w, w, cx, regions.flatMap(rect => [rect.left, rect.right]));
  const ys = axisPositions(height - h, h, cy, regions.flatMap(rect => [rect.top, rect.bottom]));
  const mx = Math.min(margin, (width - w) / 2), my = Math.min(margin, (height - h) / 2);

  let best: Placement = { left: 0, top: 0, side: "none", arrow: 0 };
  let bestScore: number[] | undefined;
  const consider = (placement: Placement, score: number[]) => {
    if (!bestScore || compare(score, bestScore) < 0) { best = placement; bestScore = score; }
  };

  for (const left of xs) for (const top of ys) {
    const box = { left, top, right: left + w, bottom: top + h };
    const targetOverlap = target ? overlap(box, target) : 0;
    const guardOverlap = guards.reduce((total, guard) => total + overlap(box, guard), 0);
    const marginLoss = Math.max(0, mx - left, box.right - (width - mx)) +
      Math.max(0, my - top, box.bottom - (height - my));
    if (target && targetOverlap === 0) {
      for (const side of sides) {
        const point = pointer(side, box, target);
        if (point) consider({ left, top, side, arrow: point.arrow }, [
          0, guardOverlap, 0, marginLoss, Math.abs(point.distance - gap), point.offset, sides.indexOf(side),
        ]);
      }
    }
    consider({ left, top, side: "none", arrow: 0 }, [
      targetOverlap, guardOverlap, target ? 1 : 0, marginLoss,
      Math.abs(left + w / 2 - cx) + Math.abs(top + h / 2 - cy), 0, 0,
    ]);
  }
  return best;
}
