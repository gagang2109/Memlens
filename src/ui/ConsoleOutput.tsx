import { useId } from "react";

export function ConsoleOutput({ children, expanded, onToggle }: { children: string; expanded: boolean; onToggle: () => void }) {
  const id = useId();
  return <div className={`console-output${expanded ? " is-expanded" : ""}`}>
    <button className="console-output-toggle" type="button" aria-controls={id} aria-pressed={expanded} onClick={onToggle}>Expand output</button>
    <pre id={id} role="region" aria-label="Program output" tabIndex={0}>{children}</pre>
  </div>;
}
