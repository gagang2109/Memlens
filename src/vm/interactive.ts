import { run, type RunResult } from "./interpreter";

/** Line-buffered simulated stdin, not an OS terminal or a resumable VM. */
export class InteractiveRun {
  private input = "";
  private closed = false;
  private submissions = 0;
  private replaySteps = 0;
  result: RunResult;
  constructor(private readonly source: string) {
    this.result = run(source, 100000, 100, "", true);
    this.replaySteps = this.result.trace.steps.length;
  }
  get transcript() { return this.input; }
  private replay(input: string, closed: boolean) {
    if (this.closed || this.result.status !== "waiting") throw new Error("This run is not waiting for input. Run again to start over.");
    if (new TextEncoder().encode(input).length > 65536) throw new Error("Interactive input is limited to 64 KiB. Shorten the example and run again.");
    if (this.submissions >= 100 || this.replaySteps >= 1000000) throw new Error("Interactive replay budget reached. Run again with a smaller example or use input ahead.");
    // Only simulated VM state is replayed. Replace the old trace and stdout;
    // never append rerun output or re-evaluate against the previous heap.
    const next = run(this.source, Math.min(100000, 1000000 - this.replaySteps), 100, input, !closed);
    this.input = input; this.closed = closed; this.submissions++;
    this.replaySteps += next.trace.steps.length; this.result = next;
    return next;
  }
  submitLine(line: string) { return this.replay(this.input + line + "\n", false); }
  sendEOF() { return this.replay(this.input, true); }
}
