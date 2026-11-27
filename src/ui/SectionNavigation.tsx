const sections = ['Code', 'Memory', 'Console', 'Trace'] as const;
export function SectionNavigation({ onOpenHelp, helpOpen, onRun }: { onOpenHelp: (trigger: HTMLElement) => void; helpOpen: boolean; onRun?: () => void }) {
  const links = () => sections.map(section => <a key={section} href={`#${section.toLowerCase()}`}>{section}</a>);
  return <nav className="section-navigation" aria-label="Workspace sections">
    <div className="section-links">{links()}</div>
    <details className="section-menu">
      <summary>☰ Sections</summary>
      <div onClick={event => {
        if ((event.target as HTMLElement).closest('a')) event.currentTarget.parentElement?.removeAttribute('open');
      }}>{links()}</div>
    </details>
    {onRun && <button className="mobile-run" type="button" aria-label="Run C code" onClick={onRun}>Run</button>}
    <button className="help-trigger" type="button" aria-haspopup="dialog" aria-expanded={helpOpen} aria-keyshortcuts="Shift+/" onClick={event => onOpenHelp(event.currentTarget)}>Help <kbd aria-hidden="true">?</kbd></button>
  </nav>;
}
