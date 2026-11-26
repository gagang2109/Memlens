import { useVisualizerFullscreen } from "./visualizerFullscreen";
import { PointerQuickLook } from "./PointerQuickLook";
import { SplitDivider, balancedSplit, type SplitSizes } from "./SplitDivider";
import { WorkspaceHelp } from "./WorkspaceHelp";
import { Spotlight, type SpotlightItem } from "./Spotlight";
import { readSampleLink, SampleShare } from "./SampleShare";
import { StarterScaffolds } from "./StarterScaffolds";
import { ArrayStackDiagram, readArrayStack } from "./ArrayStackDiagram";
import { starterScaffolds, type StarterKey } from "../starterScaffolds";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { practiceSource, validatePracticeSource, treeHeightSetup } from "./practiceHarness";
import { InteractiveRun } from "../vm/interactive";
import { InteractiveConsole } from "./InteractiveConsole";
import { ConsoleOutput } from "./ConsoleOutput";
import { ConsoleWindow } from "./ConsoleWindow";
import { run } from "../vm/interpreter";
import { samples } from "../samples";
import type { Trace, TraceStep, FrameVariable } from "../vm/trace";
import { listReturnLink, previousListLink, renderModel, treeSide, VARIABLE_TAG_WIDTH, variableTagX } from "../viz/model";
import { DiagramViewport, type MemoryViewRequest } from "./DiagramViewport";
import { CodeEditor } from "./CodeEditor";
import { readSavedCount, saveCount } from "./storage";
import { explainStep } from "./stepExplanation";
import { SectionNavigation } from "./SectionNavigation";
import { shouldHandlePlaybackShortcut, shouldOpenWorkspaceHelp, workspaceRunShortcut } from "./shortcuts";
import { checkPrediction, nextPointerPrediction, type PointerPrediction } from "../vm/predict";

function StructureDiagram({ model, highlighted, onHighlight, memoryViewRequest }: { model: ReturnType<typeof renderModel>; highlighted?: number; onHighlight: (address?: number) => void; memoryViewRequest: MemoryViewRequest | undefined }) {
  const nodeByAddress = new Map(model.nodes.map(node => [node.address, node]));
  const variableArrows = model.arrows.filter(arrow => !arrow.from.startsWith("0x") && nodeByAddress.has(arrow.to));
  const tagsByTarget = new Map<number, typeof variableArrows>();
  variableArrows.forEach(arrow => tagsByTarget.set(arrow.to, [...(tagsByTarget.get(arrow.to) ?? []), arrow]));
  const endpoints = model.queueEndpoints;
  const queueEmpty = endpoints?.every(endpoint => endpoint.address === null);
  const sameNode = endpoints && endpoints[0].address !== null && endpoints[0].address === endpoints[1].address;
  return <div className={`structure-diagram ${model.shape}${model.nodes.length === 0 ? " is-empty" : ""}`} aria-label={`${model.shape} visualization`}>
    <div className="diagram-caption">{model.shape === "singly-linked-list" ? "HEAD → linked nodes" : model.shape === "doubly-linked-list" ? "PREV ← nodes → NEXT" : model.shape === "queue" ? "FRONT → REAR" : model.shape === "stack" ? "TOP → BOTTOM" : model.shape === "tree" ? "ROOT → children" : "heap objects"}</div>
    {endpoints && <div className="queue-endpoints" role="group" aria-label="Queue endpoints">
      {endpoints.map(endpoint => {
        const node = endpoint.address === null ? undefined : nodeByAddress.get(endpoint.address);
        return <div className={`queue-endpoint queue-endpoint-${endpoint.role}`} key={endpoint.role}>
          <div><b>{endpoint.role.toUpperCase()}</b><small>{endpoint.role === "front" ? "Dequeue here" : "Enqueue here"}</small></div>
          <code>{endpoint.address === null ? "NULL" : `0x${endpoint.address.toString(16)}`}</code>
          {endpoint.address !== null && (node?.freed ? <small>Freed</small> : !node ? <small>No tracked node</small> : null)}
        </div>;
      })}
      {(queueEmpty || sameNode) && <p className="queue-state">{queueEmpty ? "Queue is empty" : "Front and rear point to the same node"}</p>}
    </div>}
    <DiagramViewport width={model.canvasWidth} height={model.canvasHeight} memoryViewRequest={memoryViewRequest}>
    <svg viewBox={`0 0 ${model.canvasWidth} ${model.canvasHeight}`} preserveAspectRatio="xMinYMin meet" role="img" aria-label="Heap nodes and pointer connections">
      <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="currentColor" /></marker><marker id="prev-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="var(--cyan)" /></marker><pattern id="freed-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line y1="0" y2="8" stroke="#aab3bd" strokeWidth="2" /></pattern></defs>
      {model.arrows.map((arrow, index) => {
        const target = nodeByAddress.get(arrow.to); if (!target) return null;
        if (!arrow.from.startsWith("0x")) { const tags = tagsByTarget.get(arrow.to) ?? []; const tagIndex = tags.indexOf(arrow); const x = variableTagX(target.x, tagIndex); return <line key={`arrow-${index}`} x1={x + VARIABLE_TAG_WIDTH / 2} y1={target.y - 22} x2={target.x + 63} y2={target.y} className={arrow.dangling ? "dangling-arrow" : "pointer-arrow"} markerEnd="url(#arrow)" />; }
        const source = nodeByAddress.get(Number.parseInt(arrow.from.slice(2).split(".")[0], 16)); if (!source) return null;
        const side = treeSide(arrow.label);
        if (model.shape === "tree" && side) {
          const left = side === "left"; const x1 = source.x + (left ? 20 : 106); const y1 = source.y + 18;
          return <line key={`arrow-${index}`} x1={x1} y1={y1} x2={target.x + 63} y2={target.y} className={arrow.dangling ? "dangling-arrow" : "pointer-arrow"} markerEnd="url(#arrow)" />;
        }
        if (arrow.label === "prev" && (model.shape === "doubly-linked-list" || model.shape === "queue")) {
          const route = previousListLink(source, target);
          return <path key={`arrow-${index}`} d={route.path} data-pointer-route="prev" className={arrow.dangling ? "dangling-arrow" : "pointer-arrow list-prev-arrow"} markerEnd={arrow.dangling ? "url(#arrow)" : "url(#prev-arrow)"}><title>{`${source.label}.prev → ${target.label}${arrow.dangling ? " (freed node)" : ""}`}</title></path>;
        }
        const returning = listReturnLink(model.shape, arrow.label, source, target);
        if (returning) return <path key={`arrow-${index}`} d={returning.path} data-pointer-route="return" className={arrow.dangling ? "dangling-arrow" : "pointer-arrow"} markerEnd="url(#arrow)"><title>{`${source.label}.next → ${target.label}${source === target ? " (same node)" : ""}${arrow.dangling ? " (freed node)" : ""}`}</title></path>;
        const targetX = target.x >= source.x ? target.x : target.x + 126;
        return <line key={`arrow-${index}`} x1={source.x + 95} y1={source.y + 27} x2={targetX} y2={target.y + 27} className={arrow.dangling ? "dangling-arrow" : "pointer-arrow"} markerEnd="url(#arrow)" />;
      })}
      {variableArrows.map((arrow, index) => {
        const node = nodeByAddress.get(arrow.to)!;
        const tagIndex = (tagsByTarget.get(arrow.to) ?? []).indexOf(arrow);
        const x = variableTagX(node.x, tagIndex);
        const endpoint = endpoints?.find(end => end.from === arrow.from && end.address === arrow.to);
        return <g key={`tag-${index}`} className={endpoint ? `queue-endpoint-tag queue-endpoint-${endpoint.role}` : undefined}>
          <rect x={x} y={node.y - 40} width={VARIABLE_TAG_WIDTH} height="18" rx="4" className="pointer-tag" />
          <text x={x + VARIABLE_TAG_WIDTH / 2} y={node.y - 27} textAnchor="middle" className="tag-text">{endpoint ? endpoint.role.toUpperCase() : arrow.label}</text>
        </g>;
      })}
      {model.nodes.map(node => <g key={node.address} transform={`translate(${node.x},${node.y})`} className={`${node.freed ? "diagram-node freed-node" : node.orphaned ? "diagram-node orphan-node" : "diagram-node"} ${highlighted === node.address ? "highlighted-node" : ""}`} onClick={() => onHighlight(node.address)}>
        {node.raw ? <><rect width="126" height="78" rx="7" /><text x="63" y="18" textAnchor="middle">raw block</text>{Array.from({ length: Math.max(1, Math.min(4, Math.ceil(node.size / 4))) }, (_, index) => <g key={index}><line x1={12 + index * 26} y1="25" x2={12 + index * 26} y2="43" className="node-divider" /><text x={25 + index * 26} y="38" textAnchor="middle" className="node-kind">{node.elementType ? node.elementType : "byte"}</text></g>)}<text x="63" y="52" textAnchor="middle" className="node-kind">{node.size} bytes</text></> : model.shape === "tree" && node.treeChildren ? <><rect width="126" height="76" rx="7" /><text x="63" y="22" textAnchor="middle">{node.value}</text>{(["left", "right"] as const).map((side, index) => {
          const child = node.treeChildren![side], x = side === "left" ? 20 : 106;
          return <g key={side}>
            {child === null ? <circle cx={x} cy="18" r="4" className="null-stub" fill="none" stroke="currentColor" /> : child !== undefined ? <text x={x} y="22" textAnchor="middle" className="next-dot">●</text> : null}
            <text x="7" y={42 + index * 12} textAnchor="start" className="node-kind">{node.aliasedTreeChildren ? (side === "left" ? "lchild" : "rchild") : side} → {child === null ? "NULL" : child === undefined ? "—" : `0x${child.toString(16)}`}</text>
          </g>;
        })}</> : node.listLinks ? <><rect width="126" height="78" rx="7" /><text x="63" y="21" textAnchor="middle">{node.value}</text><text x="8" y="38" className="node-kind">next → {node.listLinks.next}</text><text x="8" y="54" className="node-kind list-prev-label">prev → {node.listLinks.prev}</text></> : <><rect width="126" height="78" rx="7" /><line x1="63" y1="0" x2="63" y2="54" className="node-divider" />{(node.fields?.length ?? 0) > 1 ? node.fields!.map((field, index) => <text key={field} x="8" y={17 + index * 14} textAnchor="start" className="node-kind">{field}</text>) : <text x="31" y="24" textAnchor="middle">{node.value}</text>}<text x="95" y="24" textAnchor="middle" className="next-dot">●</text><text x="8" y="51" textAnchor="start" className="node-kind">next → {node.next}</text></>}<text x="8" y="70" textAnchor="start" className="node-address"><title>{`Simulated address ${node.label}${node.freed ? `; freed at step ${node.freedAtStep}` : ""}`}</title>{node.freed ? `${node.label} freed #${node.freedAtStep}` : `@ ${node.label}`}</text>
      </g>)}
    </svg>
    </DiagramViewport>
    {model.nodes.length === 0 && <div className="diagram-empty">No heap blocks to draw at this step. Local variables and arrays appear in the call stack.</div>}
  </div>;
}


const sampleLabels: Record<keyof typeof samples, string> = {
  'tree-height': 'Practice tree height — separate test setup',
  'snippet': 'Array sum snippet — no main needed',
  'requested': 'Push/reverse list — intentional use-after-free',
  'requested-uaf': 'Push/reverse use-after-free — same intentional error example',
  'tree-swap': 'Swap two tree children — trace the saved pointer',
  'tree': 'BST insert and inorder — traverse a binary tree',
  'tree-menu': 'Tree menu — insert, traverse, and delete a leaf',
  'doubly-linked-list': 'Doubly linked list — walk next and prev',
  'stack': 'Array stack — push/pop/display with MAX',
  'queue': 'Linked queue — enqueue/dequeue with front and rear',
  'factorial': 'Factorial recursion — watch frames stack',
  'use-after-free': 'Use after free — raw block fault',
};

const defaultLayout = "visualizer";
const layoutPresets = {
  visualizer: { label: "Visualizer first (default)", sizes: [28,49,23], anchor: "memory" },
  balanced: { label: "Balanced", sizes: balancedSplit, anchor: "code" },
  writing: { label: "Writing Code", sizes: [56,24,20], anchor: "code" },
  tracing: { label: "Extra wide visualizer", sizes: [22,56,22], anchor: "memory" },
  console: { label: "Console", sizes: [23,27,50], anchor: "console" },
} satisfies Record<string,{ label: string; sizes: SplitSizes; anchor: string }>;
type LayoutPreset = keyof typeof layoutPresets;
type FocusPane = "code" | "memory" | "terminal";

export function App() {
  const workspace = useRef<HTMLElement>(null);
  const samplesPicker = useRef<HTMLSelectElement>(null);
  const [splitSizes, setSplitSizes] = useState<SplitSizes>(layoutPresets[defaultLayout].sizes);
  const [activeLayout, setActiveLayout] = useState<LayoutPreset | "custom">(defaultLayout);
  const [dockRequest, setDockRequest] = useState(0);
  const [consoleReveal, setConsoleReveal] = useState(0);
  const onSplitSizes = (sizes: SplitSizes) => { setSplitSizes(sizes); setActiveLayout("custom"); };
  const selectLayout = (preset: LayoutPreset) => {
    if (visualizer.expanded) visualizer.closeExpanded(false);
    setFocusPane(undefined);
    setActiveLayout(preset);
    setSplitSizes(layoutPresets[preset].sizes);
    if (preset === "console") setDockRequest(previous => previous+1);
    if (window.innerWidth < 1040) window.requestAnimationFrame(() => document.getElementById(layoutPresets[preset].anchor)?.scrollIntoView?.({ block: "start" }));
  };
  const splitStyle = {"--split-code":splitSizes[0]+"fr","--split-memory":splitSizes[1]+"fr","--split-console":splitSizes[2]+"fr"} as CSSProperties;
  const [focusPane, setFocusPane] = useState<FocusPane>();
  const visualizer = useVisualizerFullscreen();
  const effectiveFocus = visualizer.expanded ? "memory" : focusPane;
  const toggleFocus = (pane: FocusPane) => setFocusPane(previous => previous === pane ? undefined : pane);
  const [quickLook, setQuickLook] = useState<{ name: string; variable: FrameVariable; step: TraceStep; trigger: HTMLButtonElement }>();
  const closeQuickLook = () => { const trigger = quickLook?.trigger; setQuickLook(undefined); trigger?.focus({ preventScroll: true }); };
  const [spotlight, setSpotlight] = useState(false);
  const spotlightTrigger = useRef<HTMLElement>();
  const [help, setHelp] = useState(false);
  const helpTrigger = useRef<HTMLElement>();
  const [memoryViewRequest, setMemoryViewRequest] = useState<MemoryViewRequest>();
  const showSpotlight = () => { spotlightTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : undefined; setSpotlight(true); };
  const closeSpotlight = () => { setSpotlight(false); spotlightTrigger.current?.focus({ preventScroll: true }); };
  const focusStepsAfterRun = useRef(false);
  const [sample, setSample] = useState<keyof typeof samples>("requested"); const [code, setCode] = useState(() => {
    // Restore before the persistence effect can write, including StrictMode's
    // mount-effect replay. An intentionally empty draft is still a saved draft.
    try { return localStorage.getItem("memlens-code") ?? samples.requested.code; }
    catch { return samples.requested.code; }
  });
  const [setup, setSetup] = useState(() => { try { return localStorage.getItem("memlens-test-setup") ?? ""; } catch { return ""; } });
  const [linkedSample, setLinkedSample] = useState(() => readSampleLink(window.location.hash));
  useEffect(() => {
    const update = () => setLinkedSample(readSampleLink(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const dismissSampleLink = () => {
    if (readSampleLink(window.location.hash)) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    setLinkedSample(undefined);
    samplesPicker.current?.focus({ preventScroll: true });
  };
  // Preserve an explicitly chosen alias, otherwise identify the actual editor content.
  const codeSample = code === samples[sample].code ? sample : (Object.keys(samples) as (keyof typeof samples)[]).find(key => samples[key].code === code) ?? "custom";
  const selectedSample = codeSample !== "custom" && setup === (codeSample === "tree-height" ? treeHeightSetup : "") ? codeSample : "custom";
  const [previousDraft, setPreviousDraft] = useState<{ code: string; setup: string }>();
  const [runGeneration, setRunGeneration] = useState(0);
  const session = useRef<InteractiveRun>();
  const [inputMode, setInputMode] = useState<"ahead" | "interactive">("ahead");
  const [waiting, setWaiting] = useState(false);
  const [consoleError, setConsoleError] = useState("");
  const [outputExpanded, setOutputExpanded] = useState(false);
  const toggleOutput = () => setOutputExpanded(value => !value);
  const [transcript, setTranscript] = useState("");
  const [stdin, setStdin] = useState("");
  const [executionMode, setExecutionMode] = useState<"program" | "snippet">();
  const [lastRun, setLastRun] = useState<{ code: string; stdin: string; setup: string; inputMode: string }>();
  const stale = Boolean(lastRun && (code !== lastRun.code || (inputMode === "ahead" && stdin !== lastRun.stdin) || setup !== lastRun.setup || inputMode !== lastRun.inputMode));
  const [trace, setTrace] = useState<Trace | undefined>(); const [cursor, setCursor] = useState(0); const [error, setError] = useState(""); const [fault, setFault] = useState<ReturnType<typeof run>["error"]>(); const [leaks, setLeaks] = useState<ReturnType<typeof run>["leaks"]>([]); const [highlightedAddress, setHighlightedAddress] = useState<number>();
  const [playing, setPlaying] = useState(false); const [speed, setSpeed] = useState(1); const [predictMode, setPredictMode] = useState(false); const [prediction, setPrediction] = useState<PointerPrediction>(); const [predictionResult, setPredictionResult] = useState<boolean>(); const [predictionTarget, setPredictionTarget] = useState(0);
  const [score, setScore] = useState(() => readSavedCount("memlens-predict-score")); const [streak, setStreak] = useState(() => readSavedCount("memlens-predict-streak"));
  const emptyRun = Boolean(trace && trace.steps.length === 0);
  const traceLabel = trace ? (emptyRun ? "0 recorded steps" : `step ${cursor + 1} of ${trace.steps.length}`) : "ready";
  const emptyRunMessage = "Run finished with no recorded steps. A function definition alone does not call it: add a call with your own arguments and setup. Use printf to see a bare expression's value.";
  const displayedSource = practiceSource(lastRun?.code ?? code, lastRun?.setup ?? setup);
  const location = (line: number) => displayedSource.active ? displayedSource.location(line) : `line ${line}`;
  const diagnostic = (message: string) => displayedSource.diagnostic(message);
  const view = trace?.steps[cursor];
  useEffect(() => { setQuickLook(undefined); }, [view]);
  const allocations = view?.memory.allocations ?? [];
  const model = view ? renderModel(view) : undefined;
  const arrayStackStep = lastRun?.setup === ""
    && (lastRun.code === samples.stack.code || lastRun.code === starterScaffolds.stack.code) ? view : undefined;
  // Include newly allocated and freed blocks: a pointer can target either.
  // Derive choices from both snapshots, never from the correct answer itself.
  const predictionNodes = prediction && trace ? [...new Map([
    ...allocations, ...trace.steps[predictionTarget].memory.allocations,
  ].map(node => [node.address, node])).values()].sort((a, b) => a.address - b.address) : [];
  const faultStep = fault && trace ? trace.steps.findIndex(step => step.event === "error") : -1;
  const faultReached = Boolean(fault && faultStep >= 0 && cursor >= faultStep);
  const moveTo = (next: number) => { if (!trace) return; setPredictionResult(undefined); const bounded = Math.max(0, Math.min(next, trace.steps.length - 1)); if (predictMode && !stale && bounded > cursor) { const question = nextPointerPrediction(trace.steps[cursor], trace.steps[bounded]); if (question) { setPredictionTarget(bounded); setPrediction(question); setPlaying(false); return; } } setPrediction(undefined); setPredictionResult(undefined); setCursor(bounded); };
  const showHelp = (trigger?: HTMLElement) => {
    helpTrigger.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
    setPlaying(false);
    setHelp(true);
  };
  const closeHelp = () => {
    setHelp(false);
    const trigger = helpTrigger.current;
    if (trigger?.isConnected && trigger !== document.body) trigger.focus({ preventScroll: true });
    else (visualizer.fullscreen ? visualizer.panel.current : workspace.current)?.focus({ preventScroll: true });
  };
  const applyRun = (result: ReturnType<typeof run>, latest: boolean) => {
    focusStepsAfterRun.current = result.status !== "waiting" && result.trace.steps.length >= 2;
    setTrace(result.trace); setExecutionMode(result.executionMode); setCursor(latest ? Math.max(0, result.trace.steps.length - 1) : 0);
    setFault(result.error); setLeaks(result.leaks); setError(result.error?.reason ?? ""); setWaiting(result.status === "waiting");
    if (result.status === "waiting") setFocusPane(previous => previous === "terminal" ? previous : undefined);
  };
  const runCode = (autoPlay = false) => {
    setRunGeneration(value => value + 1);
    focusStepsAfterRun.current = false;
    session.current = undefined; setWaiting(false); setTranscript(""); setConsoleError("");
    setHighlightedAddress(undefined); setLastRun({ code, stdin, setup, inputMode }); setPlaying(false); setPrediction(undefined); setPredictionResult(undefined);
    try {
      const prepared = practiceSource(code, setup); validatePracticeSource(prepared.source, prepared.active);
      const interactive = inputMode === "interactive";
      if (interactive) session.current = new InteractiveRun(prepared.source);
      const result = session.current?.result ?? run(prepared.source, 100000, 100, stdin);
      // Keep a waiting console on its latest step so it can accept input.
      const startPlayback = autoPlay && result.status !== "waiting" && result.trace.steps.length > 1;
      applyRun(result, interactive && !startPlayback);
      if (startPlayback) setPlaying(true);
    } catch (caught) { setTrace(undefined); setExecutionMode(undefined); setFault(undefined); setLeaks([]); setError(caught instanceof Error ? caught.message : "Unable to parse program"); }
  };
  const submitInteractive = (line?: string) => {
    if (!session.current || !waiting || stale) return;
    setPlaying(false); setPrediction(undefined); setPredictionResult(undefined); setConsoleError("");
    try {
      const result = line === undefined ? session.current.sendEOF() : session.current.submitLine(line);
      setTranscript(session.current.transcript); applyRun(result, true);
    } catch (caught) { setConsoleError(caught instanceof Error ? caught.message : "Unable to submit input"); }
  };
  useEffect(() => {
    if (focusStepsAfterRun.current) {
      focusStepsAfterRun.current = false;
      const target = visualizer.fullscreen || visualizer.expanded ? visualizer.panel.current : workspace.current;
      target?.focus({ preventScroll: true });
    }
  }, [trace]);
  useEffect(() => { if (stale) { setPlaying(false); setPrediction(undefined); setPredictionResult(undefined); } }, [code, stdin, setup, stale]);
  const answerPrediction = (answer: number | null) => { if (stale || !prediction || !trace || predictionResult !== undefined) return; const correct = checkPrediction(answer, prediction.expected); setPredictionResult(correct); const nextScore = correct ? score + 1 : score; const nextStreak = correct ? streak + 1 : 0; setScore(nextScore); setStreak(nextStreak); saveCount("memlens-predict-score", nextScore); saveCount("memlens-predict-streak", nextStreak);  };
  useEffect(() => {
    if (stale || !prediction || predictionResult === undefined || !trace) return;
    const timer = window.setTimeout(() => {
      setPrediction(undefined);
      setPredictionResult(undefined);
      setCursor(predictionTarget);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [prediction, predictionResult, predictionTarget, trace, stale]);
  useEffect(() => { if (!playing || !trace || prediction) return; const timer = window.setInterval(() => { if (cursor >= trace.steps.length - 1) { setPlaying(false); return; } moveTo(cursor + 1); }, 1000 / speed); return () => window.clearInterval(timer); }, [playing, trace, cursor, speed, predictMode, prediction, stale]);
  useEffect(() => {
    const onSpotlight = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k" && !event.isComposing) {
        event.preventDefault(); event.stopPropagation(); if (!spotlight && !quickLook && !help && !event.repeat) showSpotlight();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (spotlight || quickLook || help) return;
      if (shouldOpenWorkspaceHelp(event)) { event.preventDefault(); showHelp(); return; }
      if (event.key === "Escape" && !event.defaultPrevented) {
        if (visualizer.fullscreen) return; // The browser owns Esc in native fullscreen.
        if (visualizer.expanded) { event.preventDefault(); visualizer.closeExpanded(); return; }
        if (focusPane) { event.preventDefault(); setFocusPane(undefined); return; }
      }
      const runAction = workspaceRunShortcut(event);
      if (runAction) { event.preventDefault(); runCode(runAction === "run-and-play"); return; }
      if (!trace || trace.steps.length < 2 || !shouldHandlePlaybackShortcut(event)) return;
      if (!["ArrowLeft", "ArrowRight", " ", "Home", "End"].includes(event.key)) return;
      // A playback action replaces the key's native page-scroll behavior.
      event.preventDefault();
      if (event.key === "ArrowLeft") moveTo(cursor - 1);
      else if (event.key === "ArrowRight") moveTo(cursor + 1);
      else if (event.key === " " && !event.repeat) setPlaying(value => !value);
      else if (event.key === "Home") moveTo(0);
      else if (event.key === "End") moveTo(trace.steps.length - 1);
    };
    window.addEventListener("keydown", onSpotlight, true);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onSpotlight, true); window.removeEventListener("keydown", onKey); };
  }, [trace, cursor, predictMode, stale, code, stdin, setup, inputMode, spotlight, focusPane, quickLook, help, visualizer.expanded, visualizer.fullscreen]);
  useEffect(() => { try { localStorage.setItem("memlens-code", code); } catch { /* storage is optional */ } }, [code]);
  useEffect(() => { try { localStorage.setItem("memlens-test-setup", setup); } catch { /* storage is optional */ } }, [setup]);
  const replaceDraft = (nextCode: string, nextSetup: string) => {
    session.current = undefined; setWaiting(false); setTranscript(""); setConsoleError("");
    setCode(nextCode); setSetup(nextSetup); setLastRun(undefined); setTrace(undefined); setExecutionMode(undefined);
    setFault(undefined); setError(""); setLeaks([]); setPlaying(false); setPrediction(undefined); setPredictionResult(undefined); setCursor(0); setHighlightedAddress(undefined);
  };
  const selectSample = (key: keyof typeof samples) => {
    setSample(key); replaceDraft(samples[key].code, key === "tree-height" ? treeHeightSetup : "");
  };
  const loadLinkedSample = () => {
    if (!linkedSample || (selectedSample === "custom" && !window.confirm("Replace the current code and test setup with this sample?"))) return;
    if (linkedSample !== selectedSample) selectSample(linkedSample);
    dismissSampleLink();
  };
  const spotlightItems: SpotlightItem[] = [
    { id: "run", label: "Run", detail: "Run the current code", action: runCode },
    ...(model ? [
      { id: "fit", label: "Fit Memory", detail: "Fit the heap visualization to its pane", action: () => setMemoryViewRequest({ type: "fit" }) },
      { id: "reset", label: "Reset memory view", detail: "Reset zoom and pan without changing this trace step", action: () => setMemoryViewRequest({ type: "reset" }) },
    ] : []),
    ...Object.entries(sampleLabels).map(([key, label]) => ({
      id: key, label, detail: "Sample program", action: () => {
        if (selectedSample === "custom" && !window.confirm("Replace the current code and test setup with this sample?")) return false;
        selectSample(key as keyof typeof samples);
      },
    })),
  ];
  const useStarter = (key: StarterKey) => { setPreviousDraft({ code, setup }); replaceDraft(starterScaffolds[key].code, ""); };
  const restoreDraft = () => { if (previousDraft) { replaceDraft(previousDraft.code, previousDraft.setup); setPreviousDraft(undefined); } };
  const lines = useMemo(() => code.split(/\r?\n/), [code]);
  const spotlightDialog = spotlight && <Spotlight items={spotlightItems} onClose={closeSpotlight} onSelect={item => { if (item.action() !== false) closeSpotlight(); }} />;
  const helpDialog = help && <WorkspaceHelp onClose={closeHelp} />;
  return <main ref={workspace} tabIndex={-1} aria-label="Code execution workspace">
    <header><div className="brand"><img className="brand-mark" src="/memlens-mark.svg" width="36" height="36" alt="" aria-hidden="true" /> MEMLENS</div><div className="tag">Step through your C code and watch memory rewind.</div>
      <select ref={samplesPicker} aria-label="Samples" value={selectedSample} onChange={e => { if (e.target.value !== "custom") selectSample(e.target.value as keyof typeof samples); }}><option value="custom" disabled>Custom code (current editor contents)</option>{Object.entries(sampleLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
      <button type="button" className="spotlight-trigger" aria-keyshortcuts="Control+k Meta+k" onClick={event => { showSpotlight(); spotlightTrigger.current = event.currentTarget; }}>Spotlight <kbd>Ctrl / ⌘ K</kbd></button><button className="run" onClick={() => runCode()} title="Run code (Ctrl / ⌘ + Enter)" aria-keyshortcuts="Control+Enter Meta+Enter">Run</button></header>
    <SectionNavigation onOpenHelp={showHelp} helpOpen={help} />
    {linkedSample && <section className="linked-sample" aria-label="Shared sample">
      <strong>{sampleLabels[linkedSample]}</strong>
      <span>Opening the link hasn’t changed your code or test setup.</span>
      <button type="button" onClick={loadLinkedSample}>Load sample</button>
      <button type="button" onClick={dismissSampleLink}>Dismiss</button>
    </section>}
    {selectedSample !== "custom" && <SampleShare key={selectedSample} sample={selectedSample} />}
    <div className="workspace-layouts"><label htmlFor="workspace-layout">Pane sizes</label>
      <select id="workspace-layout" value={activeLayout} onChange={event => { if (event.target.value !== "custom") selectLayout(event.target.value as LayoutPreset); }}>
        <option value="custom" disabled>Custom split</option>
        {Object.entries(layoutPresets).map(([key,preset]) => <option key={key} value={key}>{preset.label}</option>)}
      </select>
    </div>
    {code === samples.requested.code && <p className="step-explanation" role="note">This example intentionally reads a node after freeing it. Run it and step through the trace to see why this causes a use-after-free error. The error is in the example C program, not Memlens.</p>}
    {!stale && executionMode === "snippet" && trace && <p className="step-explanation" role="status">Snippet run · top-level statements execute in source order; no main() wrapper is added.</p>}
    {stale && <p className="step-explanation stale-results" role="status">Code or input changed. Memory, console, errors and trace below are from the previous run. Run again to update them.</p>}
    <section className={`workspace ${inputMode === "interactive" ? "interactive-workspace" : ""}${effectiveFocus ? " has-focus" : ""}`} style={splitStyle}><div className="code-panel" id="code" tabIndex={-1} aria-label="Code section" hidden={Boolean(effectiveFocus && effectiveFocus !== "code")}><button className="pane-focus" type="button" onClick={() => toggleFocus("code")}>{focusPane === "code" ? "Restore workspace" : "Focus code"}</button><div className="panel-title">SOURCE <small>{lines.length} lines · edit a sample or paste your own C code</small></div><details className="starter-picker"><summary>Start from a scaffold</summary><StarterScaffolds onUse={useStarter} /></details><label className="input-mode">Program input <select aria-label="Input mode" value={inputMode} onChange={event => setInputMode(event.target.value as "ahead" | "interactive")}><option value="ahead">Input ahead (stdin)</option><option value="interactive">Interactive console</option></select></label>{previousDraft && <button type="button" className="restore-draft" onClick={restoreDraft}>Restore previous draft</button>}<CodeEditor onRun={() => runCode()} onRunAndPlay={() => runCode(true)} value={code} currentLine={stale || (displayedSource.active && (view?.line ?? 0) >= displayedSource.setupStart) ? undefined : view?.line} onChange={setCode} />

      <details className="practice-setup" open={setup.trim().length > 0 || undefined}>
        <summary>Test setup &amp; call (optional)</summary>
        <p>Keep your types and function above. Add input declarations and an explicit function call here. This code runs after your source, without a main() wrapper. Nothing is guessed. Clear this area for a full main() program.</p>
        <label htmlFor="test-setup">C test setup</label>
        <textarea id="test-setup" aria-label="C test setup" spellCheck={false} value={setup} onChange={event => setSetup(event.target.value)} placeholder={'int values[] = {3, 1, 2};\nprintf("%d", sum(values, 3));'} />
        <p>{!stale && view && displayedSource.active && view.line >= displayedSource.setupStart ? `Current step: ${location(view.line)}` : "Test setup has its own line numbers; source lines above stay unchanged."}</p>
      </details></div>
      <SplitDivider boundary={0} sizes={splitSizes} onSize={onSplitSizes}/>
      <div className="memory-panel" ref={visualizer.panel} id="memory" tabIndex={-1} aria-label="Memory section"
        data-enlarged={Boolean(visualizer.fullscreen || effectiveFocus === "memory")} hidden={Boolean(effectiveFocus && effectiveFocus !== "memory")}>
      <div className="visualizer-toolbar">
        <div className="panel-title">MEMORY CANVAS <small>{traceLabel}</small></div>
        <button className="visualizer-fullscreen" type="button" ref={visualizer.button} disabled={visualizer.busy} onClick={() => void visualizer.toggle()}>
          {visualizer.fullscreen ? "Exit fullscreen" : visualizer.expanded ? "Exit enlarged view" : "Fullscreen visualizer"}
        </button>
        {!visualizer.fullscreen && !visualizer.expanded && <button className="pane-focus" type="button" onClick={() => toggleFocus("memory")}>{focusPane === "memory" ? "Restore workspace" : "Focus memory"}</button>}
      </div>
      {visualizer.expanded && <p className="visualizer-expanded-note" role="status">The visualizer is expanded in this page. Press Esc to return.</p>}
      <div className="timeline" id="trace" tabIndex={-1} aria-label="Trace section"><div className="panel-title">TRACE <small>{traceLabel}</small></div><p className="step-explanation">{emptyRun ? emptyRunMessage : displayedSource.active && view ? diagnostic(explainStep(view)).replace(/^Line \d+/, location(view.line)) : explainStep(view)}</p>{waiting && !stale && <a className="waiting-console-link" href="#console" onClick={event => {
        event.preventDefault();
        const reveal = () => {
          if (document.fullscreenElement === visualizer.panel.current) return;
          setFocusPane(undefined);
          setConsoleReveal(request => request + 1);
        };
        if (visualizer.expanded) visualizer.closeExpanded(false);
        if (visualizer.fullscreen) void visualizer.exitFullscreen().then(reveal);
        else reveal();
      }}>Waiting for input · Open console ↓</a>}<div className="timeline-track"><input aria-label="Timeline" type="range" min="0" max={Math.max(0, (trace?.steps.length ?? 1) - 1)} value={cursor} onChange={e => moveTo(Number(e.target.value))} disabled={!trace || emptyRun} />{trace?.steps.map((step, index) => <button aria-label={`${step.event ?? "step"} tick ${index + 1}`} className={`event-tick tick-${step.event ?? "step"}`} style={{ left: `${trace.steps.length > 1 ? index / (trace.steps.length - 1) * 100 : 0}%` }} key={index} onClick={() => moveTo(index)} />)}</div><div className="controls"><button disabled={(trace?.steps.length ?? 0) < 2} onClick={() => setPlaying(value => !value)}>{playing ? "Pause" : "Play"} ▶</button><button data-step-navigation="true" aria-keyshortcuts="ArrowLeft" disabled={(trace?.steps.length ?? 0) < 2} onClick={() => moveTo(cursor - 1)}>← step back</button><button data-step-navigation="true" aria-keyshortcuts="ArrowRight" title="Use Left/Right arrow keys to step" disabled={(trace?.steps.length ?? 0) < 2} onClick={() => moveTo(cursor + 1)}>step forward →</button><select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value="0.5">0.5x</option><option value="1">1x</option><option value="2">2x</option><option value="4">4x</option></select><label className="predict-toggle"><input type="checkbox" disabled={stale} checked={predictMode} onChange={e => { setPredictMode(e.target.checked); setPrediction(undefined); setPredictionResult(undefined); }} /> Predict</label><span>{view ? `${location(view.line)} · ${view.event ?? "step"}` : emptyRun ? "Run finished · no recorded steps" : "No trace loaded"} · score {score} · streak {streak}</span></div>{prediction && <div className="prediction"><b>Where will {prediction.label} point after this line?</b><button disabled={predictionResult !== undefined} onClick={() => answerPrediction(null)}>NULL</button>{predictionNodes.map(node => <button key={node.address} disabled={predictionResult !== undefined} onClick={() => answerPrediction(node.address)}>{`0x${node.address.toString(16)}`}{node.freeStep !== undefined ? " (freed)" : !allocations.some(allocation => allocation.address === node.address) ? " (new block)" : ""}</button>)}{predictionResult !== undefined && <strong className={predictionResult ? "correct" : "incorrect"}>{predictionResult ? "Correct!" : "Not quite"}</strong>}</div>}</div>
        <div className={`columns${!model?.nodes.length && !arrayStackStep ? " empty-heap" : ""}`}>
          <div className="heap-column"><h3>{arrayStackStep ? "DATA STRUCTURE" : "HEAP STRUCTURE"} <small>{arrayStackStep ? "stack" : model?.shape ?? "ready"}</small></h3>{arrayStackStep && <ArrayStackDiagram stack={readArrayStack(arrayStackStep)} />}{(!arrayStackStep || model?.nodes.length) ? model ? <StructureDiagram model={model} highlighted={highlightedAddress} onHighlight={setHighlightedAddress} memoryViewRequest={memoryViewRequest} /> : <div className="diagram-empty">{emptyRun ? "No heap activity was recorded." : "Run a program to visualize its structure."}</div> : null}<div className="heap-summary">{allocations.filter(allocation => allocation.freeStep === undefined).length} live · {allocations.filter(allocation => allocation.freeStep !== undefined).length} freed · {model?.nodes.filter(node => node.orphaned).length ?? 0} orphaned</div></div>
          <div><h3>CALL STACK</h3><div className="stack-visual"><div className="stack-label">Active functions and local variables</div>{view && view.frames.slice().reverse().map((frame, frameIndex) => <div key={`${frame.name}-${frameIndex}`} className="frame"><small className="frame-name">{executionMode === "snippet" && frameIndex === view.frames.length - 1 ? "snippet" : `${frame.name}()`}</small>{Object.entries(frame.variables ?? {}).map(([key, variable]) => <div className={`stack-slot ${variable.pointer ? "pointer-slot" : ""}`} key={key} title={`${variable.type} ${key}`} onMouseEnter={() => variable.pointer && setHighlightedAddress(!variable.stringPointer && variable.value !== "null" ? Number(variable.value) : undefined)} onClick={() => variable.pointer && setHighlightedAddress(!variable.stringPointer && variable.value !== "null" ? Number(variable.value) : undefined)}><span><b>{key}</b><small>{variable.type}</small></span>{!variable.stringPointer && variable.value.startsWith("[") ? <span className="array-cells">{variable.value.slice(1, -1).split(", ").map((cell, index) => <span className="array-cell" key={index}><small>[{index}]</small>{cell}</span>)}</span> : <code>{variable.stringPointer ? `string ${JSON.stringify(variable.value)}` : variable.pointer && variable.value !== "null" ? `0x${Number(variable.value).toString(16)}` : variable.value}</code>}{variable.pointer && <button className="quick-look-trigger" type="button" aria-label={`Quick Look pointer ${key}`} onClick={event => { event.stopPropagation(); setPlaying(false); setQuickLook({ name:key, variable, step:view, trigger:event.currentTarget }); }}>Quick Look</button>}</div>)}</div>)}{!view && <div className="diagram-empty">{emptyRun ? "No variables or calls were recorded." : "Run a program to inspect its function calls and variables."}</div>}</div></div>
        </div>
        {error && !fault && <div className="crime" role="alert"><b>PROGRAM COULD NOT RUN</b><span>{diagnostic(error)}</span></div>}
        {fault && !faultReached && faultStep >= 0 && <div className="error-ahead">Error ahead at step {faultStep + 1}</div>}
        {fault && faultReached && <div className="crime"><b>EXECUTION ERROR</b><span>{diagnostic(error)} · {location(fault.line)}</span>{fault.allocation && <><button onClick={() => setCursor(fault.allocation!.allocStep)}>alloc {location(fault.allocation.line)}</button>{fault.allocation.freeStep !== undefined && <button onClick={() => setCursor(fault.allocation!.freeStep!)}>free step {fault.allocation.freeStep}</button>}</>}<button onClick={() => { if (faultStep >= 0) setCursor(faultStep); }}>access {location(fault.line)}</button></div>}
        {!fault && leaks.length > 0 && <div className="leak-report"><b>MEMORY NOT FREED AT EXIT</b><span>{leaks.length} block{leaks.length === 1 ? " was" : "s were"} never freed.</span>{leaks.map(leak => <small key={leak.address}>allocation {location(leak.line)}</small>)}</div>}
        {quickLook && quickLook.step === view && <PointerQuickLook {...quickLook} onClose={closeQuickLook} />}
        {visualizer.fullscreen && (helpDialog || spotlightDialog)}
      </div><SplitDivider boundary={1} sizes={splitSizes} onSize={onSplitSizes}/>
      <div className="terminal-panel" hidden={Boolean(effectiveFocus && effectiveFocus !== "terminal")}><ConsoleWindow dockRequest={dockRequest} revealRequest={consoleReveal} focused={focusPane === "terminal"} onFocusPane={() => toggleFocus("terminal")} waiting={waiting && !stale}>{inputMode === "interactive" && <InteractiveConsole key={runGeneration} revealRequest={consoleReveal} outputExpanded={outputExpanded} onToggleOutput={toggleOutput} output={view?.stdout ?? ""} waiting={waiting} active={Boolean(lastRun)} stale={stale} atLatest={cursor === (trace?.steps.length ?? 0) - 1} transcript={transcript} error={consoleError} onSubmit={submitInteractive} onEOF={() => submitInteractive()} onLatest={() => { setPlaying(false); setCursor(Math.max(0, (trace?.steps.length ?? 1) - 1)); }} onStop={() => { session.current = undefined; setWaiting(false); setPlaying(false); setConsoleError("Stopped. The recorded trace remains available; Run starts a new session."); }} />}{inputMode === "ahead" && <div className="console"><div className="panel-title">CONSOLE</div><label className="stdin-label">Program input (scanf) <input aria-label="Standard input" value={stdin} onChange={event => setStdin(event.target.value)} placeholder="e.g. 3 10 20 30 (space-separated)" /></label><ConsoleOutput expanded={outputExpanded} onToggle={toggleOutput}>{view ? view.stdout || "No output printed at this step." : emptyRun ? "Run finished without printed output." : "Run a program to see its printed output (printf)."}</ConsoleOutput></div>}</ConsoleWindow></div></section>
    {!visualizer.fullscreen && (helpDialog || spotlightDialog)}
    <footer><a href="https://github.com/gagang2109/Memlens" target="_blank" rel="noopener noreferrer">Memlens on GitHub ↗</a> · supports a subset of C, not a full C compiler · addresses and memory are simulated</footer>
  </main>;
}


