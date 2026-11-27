import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { placeTourCard, type TourRect } from "./tourPlacement";

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
export type TourChange = { at: number; index: number; before: string; after: string; line: number };
const headings = { 1: "Meet the editor", 2: "Run your code", 3: "Advance the trace", 4: "Read the change", 5: "Rewind a step", 6: "Playback and speed", 7: "You’re ready" } as const;

export function QuickTourWelcome({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open && typeof element.showModal === "function") element.showModal();
    else if (!element.open) element.setAttribute("open", "");
    primary.current?.focus({ preventScroll: true });
    return () => { if (element.open && typeof element.close === "function") element.close(); };
  }, []);
  return <dialog ref={dialog} className="tour-welcome" aria-labelledby="tour-welcome-title" aria-describedby="tour-welcome-summary"
    onCancel={event => { event.preventDefault(); onSkip(); }}>
    <div className="tour-welcome-brand"><img src="/memlens-mark.svg" width="30" height="30" alt="" /> <span>MEMLENS</span></div>
    <h2 id="tour-welcome-title">See your C code<br />come to life</h2>
    <p id="tour-welcome-summary">Run real C examples, see memory change, and rewind one step at a time.</p>
    <div className="tour-illustration" aria-hidden="true">
      <div><span>VALUES</span><span>INDEXED ARRAY</span></div>
      <div className="tour-array-picture">
        <span><small>[0]</small><b>2</b></span><span className="tour-array-hot"><small>[1]</small><b>4 → 7</b></span><span><small>[2]</small><b>6</b></span><span><small>[3]</small><b>8</b></span>
      </div>
      <div className="tour-illustration-trace"><span /><span /><b /><span /><span /></div>
    </div>
    <div className="tour-welcome-actions">
      <button ref={primary} className="tour-primary" type="button" onClick={onStart}>Start quick tour</button>
      <button className="tour-quiet" type="button" onClick={onSkip}>Skip and start coding</button>
    </div>
  </dialog>;
}

type Metrics = { position: ReturnType<typeof placeTourCard>; holes: TourRect[]; frame: { width: number; height: number }; anchorVisible: boolean };
const rect = (e: Element): TourRect => { const {left,top,right,bottom}=e.getBoundingClientRect(); return {left,top,right,bottom}; };
const pad = (r: TourRect): TourRect => ({ left:r.left-5, top:r.top-4, right:r.right+5, bottom:r.bottom+4 });
const screen = () => ({ width: document.documentElement.clientWidth || window.innerWidth, height: document.documentElement.clientHeight || window.innerHeight });
const onScreen = (r: TourRect, width: number, height: number) =>
  r.right > 0 && r.left < width && r.bottom > 0 && r.top < height && r.right > r.left && r.bottom > r.top;
const targetFor = (workspace: HTMLElement, step: TourStep) =>
  [...workspace.querySelectorAll<HTMLElement>(step === 2 ? "header .run, .mobile-run" : "[data-tour-target]")]
    .find(e => e.getClientRects().length > 0);
const reveal = (target: HTMLElement, narrow: boolean) => target.scrollIntoView?.({block:narrow ? "start" : "center", inline:"nearest", behavior:"instant"});

export function QuickTourHint({ workspace, step, change, triedPlay, triedSpeed, onExit, onBack, onNext, onSkip, anchorVersion, onReveal }: {
  workspace: RefObject<HTMLElement>; step: TourStep; change?: TourChange; triedPlay: boolean; triedSpeed: boolean;
  onExit: () => void; onBack: () => void; onNext: () => void; onSkip: () => void; anchorVersion?: number; onReveal: () => void;
}) {
  const popup = useRef<HTMLElement>(null);
  const maskId = useId().replaceAll(":", "");
  const progressId = useId(), titleId = useId(), descriptionId = useId();
  const [metrics, setMetrics] = useState<Metrics>();
  const [narrow, setNarrow] = useState(false);
  // Re-measure on scroll, resize, zoom, and actual content size changes. Portal-
  // free fixed overlays stay mounted separately from every workspace panel.
  useLayoutEffect(() => {
    const root = workspace.current, card = popup.current;
    if (!root || !card) return;
    const target = targetFor(root, step);
    const codeLine = step === 4 ? root.querySelector(".cm-memlens-current") : null;
    let frameRequest = 0;
    let first = true;
    const update = () => {
      const frame = screen(), small = frame.width <= 620;
      setNarrow(small);
      const size = {width:card.offsetWidth,height:card.offsetHeight};
      const spotlight = () => {
        if (!target) return undefined;
        const r = rect(target);
        // Highlight a usable portion of the editor, without asking a short
        // viewport to fit its entire scrollable code pane beside the card.
        if (step === 1 && small) r.bottom = Math.min(r.bottom, r.top + 48);
        return r;
      };
      let anchor = spotlight();
      let extra = codeLine && onScreen(rect(codeLine), frame.width, frame.height) ? [rect(codeLine)] : [];
      let position = anchor ? placeTourCard(anchor, size, frame, extra) : undefined;
      const sticky = small && step !== 2 ? root.querySelector(".section-navigation")?.getBoundingClientRect().bottom ?? 0 : 0;
      if (first && target && anchor && (anchor.top < Math.max(8, sticky + 3) || anchor.bottom > frame.height - 8 || position?.side === "none")) {
        reveal(target, small);
        anchor = spotlight();
        extra = codeLine && onScreen(rect(codeLine), frame.width, frame.height) ? [rect(codeLine)] : [];
        position = anchor ? placeTourCard(anchor, size, frame, extra) : undefined;
      }
      first = false;
      const visible = !!anchor && onScreen(anchor, frame.width, frame.height);
      const fallback = { left: Math.max(8,(frame.width-size.width)/2), top:Math.max(8,frame.height-size.height-14), side:"none" as const, arrow:0 };
      const holes = anchor && visible ? [anchor,...extra].map(pad) : [];
      setMetrics({position: visible && position ? position : fallback, holes, frame, anchorVisible: visible});
    };
    const queue = () => {
      if (frameRequest) return;
      frameRequest = requestAnimationFrame(() => { frameRequest=0; update(); });
    };
    update();
    window.addEventListener("scroll", queue, true);
    window.addEventListener("resize", queue);
    window.visualViewport?.addEventListener("resize", queue);
    window.visualViewport?.addEventListener("scroll", queue);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(queue);
    [card, root, target, codeLine].forEach(el => { if (el) observer?.observe(el); });
    return () => {
      cancelAnimationFrame(frameRequest); observer?.disconnect();
      window.removeEventListener("scroll", queue, true); window.removeEventListener("resize", queue);
      window.visualViewport?.removeEventListener("resize", queue); window.visualViewport?.removeEventListener("scroll", queue);
    };
  }, [workspace, step, triedPlay, triedSpeed, change, anchorVersion]);
  useLayoutEffect(() => {
    const root = workspace.current;
    if (!root) return;
    const target = targetFor(root, step);
    if (step === 3 || step === 5) target?.focus({ preventScroll: true });
    else if (step !== 2) popup.current?.focus({ preventScroll: true });
  }, [step, workspace]);

  const name = change && `values[${change.index}]`;
  const continueCopy = {
    1: <>Click or Tab into the editor to inspect the temporary example.</>,
    2: <>Click <strong>Run</strong> or use a shortcut to continue.</>,
    3: <>Click <strong>Step forward</strong> or press <kbd>→</kbd> until an array cell changes.</>,
    4: <>The gold cell shows <code>{name}</code> changed from <strong>{change?.before}</strong> to <strong>{change?.after}</strong>.</>,
    5: <>Click <strong>Step back</strong> or press <kbd>←</kbd> to see <code>{name}</code> return to {change?.before}.</>,
    6: <>{triedPlay ? <>Try another speed with the menu or keys.</> : <>Click <strong>Play</strong> or press <kbd>Space</kbd> outside controls.</>}</>,
    7: <>Finish to return to your code. You can restart the tour from Help.</>,
  };
  const nextAvailable = step === 4 || step === 6 && triedPlay && triedSpeed;
  const position = metrics?.position;
  const style = position ? {left:position.left, top:position.top, "--tour-arrow":`${position.arrow}px`} as CSSProperties : undefined;
  return <>
    {metrics && <svg className="tour-scrim" aria-hidden="true" viewBox={`0 0 ${metrics.frame.width} ${metrics.frame.height}`} preserveAspectRatio="none">
      <defs><mask id={maskId}><rect width="100%" height="100%" fill="white" />{metrics.holes.map((r,i) =>
        <rect key={i} x={r.left} y={r.top} width={r.right-r.left} height={r.bottom-r.top} rx="7" fill="black" />)}</mask></defs>
      <rect width="100%" height="100%" fill="rgba(4,9,16,.42)" mask={`url(#${maskId})`} />
    </svg>}
    <section ref={popup} className="tour-hint" style={style} data-tour-side={position?.side ?? "none"} data-phase={step}
      role="region" aria-labelledby={titleId} aria-describedby={`${progressId} ${descriptionId}`} tabIndex={-1}>
      <span className="tour-arrow" aria-hidden="true" />
      <div className="tour-hint-body">
        <div className="tour-progress" id={progressId}><span>{step === 7 ? "Tour complete" : `${step} of 6`}</span>
          <span className="tour-dots" aria-hidden="true">{Array.from({length:6},(_,i)=><i key={i} data-state={i+1 === step ? "active" : i+1 < step ? "done" : "ahead"} />)}</span></div>
        <h2 id={titleId}>{headings[step]}</h2>
        <p id={descriptionId} aria-live="polite">{continueCopy[step]}</p>
        {step === 2 && <div className="tour-key-rows"><span>Run</span><span><kbd>Ctrl+Enter</kbd> <kbd>⌘+Enter</kbd></span><span>Run &amp; Play</span><kbd>Shift+Enter</kbd></div>}
        {(step === 3 || step === 5) && <small className="tour-key-note">Arrow keys work outside text fields.</small>}
        {step === 4 && narrow && change && <code className="tour-code-line" aria-label="Executed code">{quickTourSource.split("\n")[change.line-1]?.trim()}</code>}
        {step === 6 && <div className="tour-speed-keys"><span><kbd>+</kbd> Faster</span><span><kbd>-</kbd> Slower</span><span><kbd>=</kbd> 1×</span></div>}
        {metrics && !metrics.anchorVisible && step < 7 && <button className="tour-quiet tour-find-target" type="button" onClick={() => { const root=workspace.current; const t=root&&targetFor(root,step); if(t) reveal(t,narrow); else onReveal(); }}>Show target</button>}
        <div className="tour-actions">
          {step > 1 && step < 7 && <button className="tour-quiet" type="button" onClick={onBack}>Back</button>}
          {step < 7 && !nextAvailable && <button className="tour-quiet" type="button" onClick={onSkip}>Skip step</button>}
          <button className={step === 7 ? "tour-primary" : "tour-quiet tour-exit"} type="button" onClick={onExit}>{step === 7 ? "Finish" : "Exit tour"}</button>
          {nextAvailable && <button className="tour-primary" type="button" onClick={onNext}>Next</button>}
        </div>
      </div>
    </section>
  </>;
}
