export const quickTourSource = `int main(void) {
    int values[4] = {2, 4, 6, 8};
    for (int i = 0; i < 4; i++) {
        values[i] += 3;
    }
    for (int i = 3; i >= 0; i--) {
        values[i] *= 2;
    }
    return 0;
}`;
export const tourPreference = "memlens-quick-tour-seen";
export type TourStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type TourChange = { at: number; index: number; before: string; after: string };
const headings = {
  1: "Code",
  2: "Run",
  3: "Step forward",
  4: "Read the change",
  5: "Rewind",
  6: "Playback and speed",
  7: "You’re ready",
} as const;

export function QuickTourWelcome({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return <section className="tour-welcome" aria-labelledby="tour-welcome-title">
    <div><h2 id="tour-welcome-title">Welcome to Memlens</h2>
      <p>Explore your C code through memory diagrams and reversible execution. Want a quick tour?</p></div>
    <div className="tour-actions">
      <button className="tour-primary" type="button" onClick={onStart}>Start quick tour</button>
      <button type="button" onClick={onSkip}>Skip and start coding</button>
    </div>
  </section>;
}

export function QuickTourHint({ step, change, triedPlay, triedSpeed, onExit, onBack, onNext }: {
  step: TourStep; change?: TourChange; triedPlay: boolean; triedSpeed: boolean;
  onExit: () => void; onBack: () => void; onNext: () => void;
}) {
  const name = change && `values[${change.index}]`;
  const message = {
    1: <>Click or Tab into the editor to look at the temporary demo.</>,
    2: <>Click <strong>Run</strong> or press <kbd>Ctrl+Enter</kbd> / <kbd>⌘+Enter</kbd>. <kbd>Shift+Enter</kbd> runs and starts playback.</>,
    3: <>Click <strong>Step forward</strong> or press <kbd>→</kbd> outside text fields until an array cell changes.</>,
    4: <>The gold cell shows <code>{name}</code> changed from <strong>{change?.before}</strong> to <strong>{change?.after}</strong>.</>,
    5: <>Click <strong>Step back</strong> or press <kbd>←</kbd> outside text fields to see <code>{name}</code> return to {change?.before}.</>,
    6: <>{triedPlay ? <>Try another speed using the menu or keys.</> : <>Click <strong>Play</strong> or press <kbd>Space</kbd> outside controls.</>}
      <span className="tour-speed-keys"><kbd>+</kbd> Faster <kbd>-</kbd> Slower <kbd>=</kbd> 1×</span></>,
    7: <>Finish to return to your code. You can reopen the tour from Help.</>,
  };
  return <section className={`tour-hint tour-hint-${step}`} aria-label="Quick tour" tabIndex={-1}>
    <div className="tour-message" aria-live="polite" aria-atomic="true">
      <small>{step === 7 ? "Tour complete" : `Step ${step} of 6`}</small>
      <h2>{headings[step]}</h2><p>{message[step]}</p>
    </div>
    <div className="tour-actions">
      {step > 1 && step < 7 && <button type="button" onClick={onBack}>Back</button>}
      {(step === 4 || step === 6 && triedPlay && triedSpeed) && <button className="tour-primary" type="button" onClick={onNext}>Next</button>}
      <button className={step === 7 ? "tour-primary" : undefined} type="button" onClick={onExit}>{step === 7 ? "Finish" : "Exit tour"}</button>
    </div>
  </section>;
}
