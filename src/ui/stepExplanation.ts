import type { TraceStep } from "../vm/trace";

/** Explain only recorded events, not an inferred C statement result. */
export function explainStep(step?: Pick<TraceStep, "line" | "event" | "message">): string {
  if (!step) return "Choose a sample, click Run, then use step forward to explore one recorded change at a time.";
  const explanations = {
    step: "Inspect the variables and memory recorded at this point.",
    alloc: "A block of simulated heap memory was allocated. Look for its address in the structure view.",
    free: "A free operation was recorded. Freeing memory does not automatically clear pointers to it.",
    call: "A function call was recorded. The call stack shows the active function frames and their variables.",
    return: "A function return was recorded. Compare the call stack with the previous step.",
    error: "Execution stopped here because of an error. Review the message and step back to inspect what led to it.",
    warning: "A warning was recorded. Review the message before continuing.",
  };
  return `Line ${step.line}: ${explanations[step.event ?? "step"]}${step.message ? ` ${step.message}` : ""}`;
}
