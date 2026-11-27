import { useEffect, useRef, type KeyboardEvent } from "react";

const shortcuts = {
  "Run & navigate": [
    ["Run without playing", "Ctrl / ⌘ + Enter"],
    ["Run & play (editor and workspace)", "Shift + Enter"],
    ["Find samples and actions in Spotlight", "Ctrl / ⌘ + K"],
    ["Show Help (outside text fields)", "?"],
  ],
  Playback: [
    ["Step backward / forward", "← / →"],
    ["Play or pause", "Space"],
    ["First / last step", "Home / End"],
    ["Jump to an exact call, return, allocation, free, warning or error", "Previous / Next event"],
  ],
  "Source editor": [
    ["New line with automatic indentation", "Enter"],
    ["Toggle comments", "Ctrl / ⌘ + /"],
    ["Alternate comment shortcut", "Alt + Shift + A"],
    ["Find and replace", "Ctrl / ⌘ + F"],
    ["Undo / redo", "Ctrl / ⌘ + Z / Ctrl / ⌘ + Shift + Z"],
    ["Select all", "Ctrl / ⌘ + A"],
    ["Indent less / more", "Ctrl / ⌘ + [ / ]"],
    ["Move selected lines", "Alt + ↑ / ↓"],
    ["Move focus to another control", "Tab / Shift + Tab"],
  ],
} as const;

export function WorkspaceHelp({ onClose, reportProblem, onQuickTour }: { onClose: () => void; reportProblem: string; onQuickTour: () => void }) {
  const content = useRef<HTMLDivElement>(null);
  const readme = useRef<HTMLAnchorElement>(null);
  const report = useRef<HTMLAnchorElement>(null);
  const quickTour = useRef<HTMLButtonElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  useEffect(() => { content.current?.focus({ preventScroll: true }); }, []);

  function handleKey(event: KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Tab") {
      event.preventDefault();
      const stops = [content.current, readme.current, report.current, quickTour.current, dismiss.current];
      const active = stops.findIndex(stop => stop === document.activeElement);
      const next = active < 0 ? 0 : (active + (event.shiftKey ? -1 : 1) + stops.length) % stops.length;
      stops[next]?.focus();
    }
  }

  return <div className="help-scrim" onPointerDown={event => {
    if (event.target === event.currentTarget) { event.preventDefault(); onClose(); }
  }}>
    <section className="workspace-help" role="dialog" aria-modal="true" aria-labelledby="workspace-help-title" onKeyDown={handleKey}>
      <div className="help-heading">
        <h2 id="workspace-help-title">Memlens Help</h2>
        <p>Keyboard shortcuts and a quick guide to the visualizer.</p>
      </div>
      <div className="help-body" ref={content} tabIndex={0} role="region" aria-label="Keyboard shortcuts and guides">
        {Object.entries(shortcuts).map(([group, rows]) => <section key={group}>
          <h3>{group}</h3>
          <dl>{rows.map(([action, keys]) => <div key={action}><dt>{action}</dt><dd><kbd>{keys}</kbd></dd></div>)}</dl>
        </section>)}
        <section className="help-basics">
          <h3>Using the workspace</h3>
          <p><strong>Start here:</strong> Choose a sample or paste your own C. Run, then step or play to see what changes. Memlens supports a subset of C; you can also run a snippet without <code>main()</code>.</p>
          <p><strong>Read the diagram:</strong> Arrows show where pointers point. <code>NULL</code> means no target, and <code>0x…</code> addresses are simulated. Don’t access freed blocks. Gold highlights compare this step with the previous recorded step. Use Fit width or the fullscreen control when you need more room.</p>
          <p><strong>Find structure views:</strong> After Run, step until your variables appear under Memory → Call Stack. Indexed arrays and matrices are shown there. If a variable qualifies, select its View as button to open a graph, stack, queue, or heap matrix. Memlens does not infer arbitrary C data structures. For examples, try Array stack, Linked queue, or BFS / DFS under Samples.</p>
          <p><strong>Give the program input:</strong> Fill in standard input before running, or use Interactive console to type when prompted. Run &amp; Play leaves a waiting prompt ready for input.</p>
          <p><a ref={readme} href="https://github.com/gagang2109/Memlens#readme" target="_blank" rel="noopener noreferrer">Read the full guide on GitHub ↗</a></p>
          <p><a ref={report} href={reportProblem} target="_blank" rel="noopener noreferrer">Report a problem on GitHub ↗</a> · Issues are public. Share only the code and input you choose to include; nothing is attached automatically.</p>
        </section>
      </div>
      <div className="help-actions"><div className="help-tour"><strong>New to Memlens? Take the quick tour</strong><button type="button" ref={quickTour} onClick={onQuickTour}>Start tutorial</button></div><span><kbd>Esc</kbd> to close</span><button type="button" ref={dismiss} onClick={onClose}>Dismiss</button></div>
    </section>
  </div>;
}
