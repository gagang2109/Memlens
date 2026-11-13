import { useState } from 'react';
import { starterScaffolds, type StarterKey } from '../starterScaffolds';

export function StarterScaffolds({ onUse }: { onUse: (key: StarterKey) => void }) {
  const [selected, setSelected] = useState<StarterKey>('tree');
  const [confirming, setConfirming] = useState(false);
  const starter = starterScaffolds[selected];
  return <section className="starter-scaffolds" aria-label="Starter scaffolds">
    <div className="starter-row"><label htmlFor="starter-category">Start from a scaffold</label>
      <select id="starter-category" value={selected} onChange={event => { setSelected(event.target.value as StarterKey); setConfirming(false); }}>
        {Object.entries(starterScaffolds).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}
      </select>
      <button type="button" onClick={() => setConfirming(true)}>Use starter</button>
    </div>
    <p>{starter.description} All code remains editable.</p>
    {confirming && <div className="starter-confirm" role="group" aria-label="Confirm starter replacement">
      <p>Replace the source with the {starter.name.toLowerCase()} starter and clear test setup? Your current source and setup can be restored with “Restore previous draft” until you reload or load another starter. Nothing runs automatically.</p>
      <button type="button" onClick={() => { onUse(selected); setConfirming(false); }}>Replace source and clear test setup</button>
      <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
    </div>}
  </section>;
}
