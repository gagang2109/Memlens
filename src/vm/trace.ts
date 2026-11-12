import type { MemorySnapshot } from "./memory";
export type EventKind = "step" | "alloc" | "free" | "error" | "warning" | "call" | "return";
export type FrameVariable = { type: string; value: string; pointer: boolean };
export type FrameView = { name: string; locals: Record<string, string>; variables?: Record<string, FrameVariable> };
export type PointerArrow = { from: string; to: number; label: string; dangling: boolean };
export type HeapView = { address: number; fields: Record<string, string>; type?: string };
export type TraceStep = { index: number; line: number; stdout: string; memory: MemorySnapshot; frames: FrameView[]; heap?: HeapView[]; pointers?: PointerArrow[]; event?: EventKind; message?: string };
export class Trace {
  steps: TraceStep[] = []; current = 0;
  add(step: Omit<TraceStep, "index">) { this.steps.push({ ...step, index: this.steps.length }); this.current = this.steps.length - 1; }
  goto(index: number) { if (!this.steps.length) return undefined; this.current = Math.max(0, Math.min(index, this.steps.length - 1)); return this.steps[this.current]; }
  get view() { return this.steps[this.current]; }
}
