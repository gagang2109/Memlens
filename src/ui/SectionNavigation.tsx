const sections = ['Code', 'Memory', 'Console', 'Trace'] as const;
export function SectionNavigation() {
  const links = () => sections.map(section => <a key={section} href={`#${section.toLowerCase()}`}>{section}</a>);
  return <nav className="section-navigation" aria-label="Workspace sections">
    <div className="section-links">{links()}</div>
    <details className="section-menu">
      <summary>☰ Sections</summary>
      <div onClick={event => {
        if ((event.target as HTMLElement).closest('a')) event.currentTarget.parentElement?.removeAttribute('open');
      }}>{links()}</div>
    </details>
    <span className="run-hint">Ctrl / ⌘ + Enter to run</span>
  </nav>;
}
