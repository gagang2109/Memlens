import { useEffect, useRef, useState } from "react";

export function InteractiveConsole({ output, waiting, active, stale, atLatest, transcript, error, onSubmit, onEOF, onLatest, onStop }: {
  output: string; waiting: boolean; active: boolean; stale: boolean; atLatest: boolean;
  transcript: string; error: string; onSubmit: (line: string) => void; onEOF: () => void; onLatest: () => void; onStop: () => void;
}) {
  const [line, setLine] = useState("");
  const [open, setOpen] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (waiting && !stale) setOpen(true); }, [waiting, stale, transcript]);
  useEffect(() => { if (waiting && !stale && atLatest && open) input.current?.focus({ preventScroll: true }); }, [waiting, stale, atLatest, open, transcript]);
  useEffect(() => { setLine(""); }, [transcript, active]);
  return <section data-run-shortcut="ignore" className="interactive-console" aria-label="Interactive console">
    <button className="console-heading" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>Interactive console {open ? "▾" : "▸"}</button>
    {open && <>
      <p className="console-state" role="status">{stale ? "Code or mode changed. Run again before entering input." : waiting ? "Waiting for input" : active ? "Run finished" : "Press Run to start an interactive program."}</p>
      <pre aria-label="Program output">{output || "No output printed at this step."}</pre>
      {waiting && !atLatest && !stale && <button type="button" onClick={onLatest}>Return to waiting step</button>}
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
