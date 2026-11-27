export const quickTourSource = `int main(void) {
    int count = 2;
    count = 5;
    return 0;
}`;
export const tourPreference = "memlens-quick-tour-seen";
export type TourStep = 1 | 2 | 3 | 4 | 5 | 6;
const copy = {
  1: ["Code", "Paste your own C code here or choose an example. For this tour, focus the editor to take a look at the temporary example."],
  2: ["Run", "Select Run to record the program’s execution so you can explore it."],
  3: ["Step forward", "Select Step forward until count changes from 2 to 5. Watch the source and memory update together."],
  4: ["Read the diagram", "The gold highlight in Call Stack shows that count changed from 2 to 5 at this step."],
  5: ["Rewind", "Select Step back. The same variable will go back to 2."],
  6: ["You’re ready", "Explore more controls and diagram views in Help. Finish to return to your workspace."],
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

export function QuickTourHint({ step, onExit, onBack, onNext }: { step: TourStep; onExit: () => void; onBack: () => void; onNext: () => void }) {
  const [heading, description] = copy[step];
  return <section className="tour-hint" aria-label="Quick tour" tabIndex={-1}>
    <div className="tour-message" aria-live="polite" aria-atomic="true">
      <small>{step === 6 ? "Tour complete" : `Step ${step} of 5`}</small>
      <h2>{heading}</h2><p>{description}</p>
    </div>
    <div className="tour-actions">
      {step > 1 && step < 6 && <button type="button" onClick={onBack}>Back</button>}
      {step === 4 && <button className="tour-primary" type="button" onClick={onNext}>Next</button>}
      <button className={step === 6 ? "tour-primary" : undefined} type="button" onClick={onExit}>{step === 6 ? "Finish" : "Exit tour"}</button>
    </div>
  </section>;
}
