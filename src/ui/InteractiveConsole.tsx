import { useEffect, useRef, useState } from "react";
import { ConsoleOutput } from "./ConsoleOutput";

export function InteractiveConsole({ output, outputExpanded, onToggleOutput, waiting, active, stale, atLatest, transcript, error, onSubmit, onEOF, onLatest, onStop, revealRequest }: {
  output: string; outputExpanded: boolean; onToggleOutput: () => void; waiting: boolean; active: boolean; stale: boolean; atLatest: boolean;
  transcript: string; error: string; revealRequest: number; onSubmit: (line: string) => void; onEOF: () => void; onLatest: () => void; onStop: () => void;
}) {
  const [line, setLine] = useState("");
  const [open, setOpen] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const returnToWaiting = useRef<HTMLButtonElement>(null);
  const previousReveal = useRef(revealRequest);
  useEffect(() => {
    if (previousReveal.current === revealRequest || !waiting || stale) return;
    if (!open) { setOpen(true); return; }
    // Focus after the workspace and floating terminal have both been revealed.
    const frame = window.requestAnimationFrame(() => {
      previousReveal.current = revealRequest;
      const target = atLatest ? input.current : returnToWaiting.current;
      target?.scrollIntoView?.({ block: "nearest" });
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [revealRequest, waiting, stale, atLatest, open]);
  useEffect(() => { if (waiting && !stale) setOpen(true); }, [waiting, stale, transcript]);
  useEffect(() => { if (waiting && !stale && atLatest && open) input.current?.focus({ preventScroll: true }); }, [waiting, stale, atLatest, open, transcript]);
  useEffect(() => { setLine(""); }, [transcript, active]);
  return <section data-run-shortcut="ignore" className="interactive-console" aria-label="Interactive console">
    <button className="console-heading" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>Interactive console {open ? "▾" : "▸"}</button>
    {open && <>
      <p className="console-state" role="status">{stale ? "Code or mode changed. Run again before entering input." : waiting ? "Waiting for input" : active ? "Run finished" : "Press Run to start an interactive program."}</p>
      <ConsoleOutput expanded={outputExpanded} onToggle={onToggleOutput}>{output || "No output printed at this step."}</ConsoleOutput>
      {waiting && !atLatest && !stale && <button type="button" ref={returnToWaiting} onClick={onLatest}>Return to waiting step</button>}
      <form onSubmit={event => { event.preventDefault(); if (waiting && !stale && atLatest) onSubmit(line); }}>
        <label htmlFor="interactive-input">Enter a line (Enter to send)</label>
        <div className="console-input-row"><input ref={input} id="interactive-input" autoComplete="off" spellCheck={false} value={line} maxLength={65535} disabled={!waiting || stale || !atLatest} onChange={event => setLine(event.target.value)} /><button type="submit" disabled={!waiting || stale || !atLatest}>Send</button><button type="button" disabled={!waiting || stale || !atLatest} onClick={onEOF}>Send EOF</button></div>
      </form>
      {waiting && <button type="button" onClick={onStop}>Stop interactive run</button>}
      {error && <p role="alert">{error}</p>}
      <details><summary>Submitted input</summary><pre>{transcript || "No lines submitted."}</pre></details>
      <small>Simulated C input, not a system terminal. Each submission replays from the start with your saved input. Output and memory show the selected step. Run restarts; stepping back does not send input again.</small>
    </>}
  </section>;
}
