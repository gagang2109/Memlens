import type { DiagnosticKind } from "../vm/memory";
import type { TraceStep } from "../vm/trace";

/** Explain only recorded events, not an inferred C statement result. */
export function explainStep(step?: Pick<TraceStep, "line" | "event" | "message">, options: { kind?: DiagnosticKind; canRewind?: boolean } = {}): string {
  if (!step) return "Choose a sample, click Run, then use step forward to explore one recorded change at a time.";
  if (step.event === "error" && options.kind === "parse") {
    const hint = step.message?.includes("expected ';'")
      ? " Check this line and the statement above it for a missing semicolon."
      : " Review the reported token or construct, then run again.";
    return `Line ${step.line}: Memlens could not read the code, so nothing ran.${hint}`;
  }
  if (step.event === "error" && options.kind === "unresolved-function")
    return `Line ${step.line}: Execution stopped at a function call that Memlens could not resolve. See the message below.`;
  const explanations = {
    step: "Inspect the variables and memory recorded at this point.",
    alloc: "A block of simulated heap memory was allocated. Look for its address in the structure view.",
    free: "A free operation was recorded. Freeing memory does not automatically clear pointers to it.",
    call: "A function call was recorded. The call stack shows the active function frames and their variables.",
    return: "A function return was recorded. Compare the call stack with the previous step.",
    error: options.canRewind ? "Execution stopped here. Review the message or step back to inspect what led to it." : "Execution stopped here. Review the message.",
    warning: "A warning was recorded. Review the message before continuing.",
  };
  return `Line ${step.line}: ${explanations[step.event ?? "step"]}${step.message ? ` ${step.message}` : ""}`;
}
