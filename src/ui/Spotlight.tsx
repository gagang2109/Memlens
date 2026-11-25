import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export type SpotlightItem = { id: string; label: string; detail: string; action: () => void | boolean };
export function Spotlight({ items, onClose, onSelect }: { items: SpotlightItem[]; onClose: () => void; onSelect: (item: SpotlightItem) => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hint = useId();
  const list = useId();
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = items.filter(item => words.every(word => (item.label + " " + item.detail).toLowerCase().includes(word)));
  useEffect(() => { input.current?.focus(); }, []);
  function keys(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key === "Tab") { event.preventDefault(); input.current?.focus(); return; }
    if (event.nativeEvent.isComposing || !results.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = (selected + step + results.length) % results.length;
      setSelected(next);
      document.getElementById(list + "-" + next)?.scrollIntoView?.({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault(); onSelect(results[selected]);
    }
  }
  return <div className="spotlight-scrim" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="spotlight" role="dialog" aria-modal="true" aria-label="Spotlight" onKeyDown={keys}>
      <label htmlFor={hint}>Spotlight</label>
      <input id={hint} ref={input} role="combobox" aria-expanded="true" aria-controls={list}
        aria-activedescendant={results[selected] ? list + "-" + selected : undefined}
        aria-autocomplete="list" value={query} placeholder="Find samples and actions"
        onChange={event => {setQuery(event.target.value); setSelected(0);}} />
      <ul id={list} role="listbox" aria-label="Matching actions and samples">
        {results.map((item,index) => <li role="option" aria-selected={selected === index} id={list + "-" + index} key={item.id}
          onPointerMove={() => setSelected(index)} onMouseDown={event => event.preventDefault()} onClick={() => onSelect(item)}>
          <span>{item.label}</span><small>{item.detail}</small>
        </li>)}
      </ul>
      {results.length === 0 && <p role="status">No matches.</p>}
      <p className="spotlight-hint">↑ ↓ Select · Enter Open · Esc Close</p>
    </section>
  </div>;
}
