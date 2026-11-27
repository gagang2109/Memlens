import { adjacentEvents, traceMarkers } from "./traceMarkers";
import { stepNumber } from "./traceLabels";
import { GraphDiagram } from "./GraphDiagram";
import { graphSize } from "../viz/graph";
import { IndexedArray } from "./IndexedArray";
import { readStructStack, StructStackDiagram } from "./StructStackDiagram";
import { HeapMatrixDiagram, readHeapMatrix } from "./HeapMatrixDiagram";
import { readCircularQueue, StructCircularQueueDiagram } from "./StructCircularQueueDiagram";
import { canShowLinearQueue, readLinearQueue, StructQueueDiagram } from "./StructQueueDiagram";
import { describeChange, frameKey, stepChanges, type VariableChange } from "./stepChanges";
import { useVisualizerFullscreen } from "./visualizerFullscreen";
import { PointerQuickLook } from "./PointerQuickLook";
import { SplitDivider, balancedSplit, type SplitSizes } from "./SplitDivider";
import { QuickTourHint, QuickTourWelcome, quickTourSource, tourPreference, type TourChange, type TourStep } from "./QuickTour";
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
import { convertedList } from "../viz/convertedList";
import { listReturnLink, previousListLink, renderConvertedList, renderModel, treeSide, VARIABLE_TAG_WIDTH, variableTagX } from "../viz/model";
import { DiagramViewport, type MemoryViewRequest } from "./DiagramViewport";
import { CodeEditor } from "./CodeEditor";
import { readSavedCount, saveCount } from "./storage";
import { explainStep } from "./stepExplanation";
import { SectionNavigation } from "./SectionNavigation";
import { playbackSpeedShortcut, playbackSpeeds, stepPlaybackSpeed, shouldHandlePlaybackShortcut, shouldOpenWorkspaceHelp, workspaceRunShortcut } from "./shortcuts";
import { checkPrediction, nextPointerPrediction, type PointerPrediction } from "../vm/predict";

type Draft = { code: string; setup: string };
const previousDraftKey = "memlens-previous-draft";
const reportProblem = "https://github.com/gagang2109/Memlens/issues";

function readPreviousDraft(): Draft | undefined {
  try {
    const draft = JSON.parse(localStorage.getItem(previousDraftKey) ?? "null");
    if (typeof draft?.code === "string" && typeof draft.setup === "string") return draft;
  } catch { /* storage is optional */ }
}

function StackValue({ name, variable, change, generation, tourCell }: { name: string; variable: FrameVariable; change?: VariableChange; generation: number; tourCell?: number }) {
  if (variable.array) return <IndexedArray key={`${generation}:${variable.array.base}`} name={name} array={variable.array} change={change} tourCell={tourCell} />;
  const delta = change && "before" in change ? change : undefined;
  return <code title={delta ? describeChange(delta) : undefined}>
    {delta && <small className="step-value-before">{delta.before} → </small>}
    {delta ? delta.after : variable.stringPointer ? `string ${JSON.stringify(variable.value)}` : variable.pointer && variable.value !== "null"
      ? `0x${Number(variable.value).toString(16)}` : variable.value}
  </code>;
}

function StructureDiagram({ model, highlighted, onHighlight, memoryViewRequest, changedHeap }: { changedHeap: ReadonlyMap<number, string>; model: ReturnType<typeof renderModel>; highlighted?: number; onHighlight: (address?: number) => void; memoryViewRequest: MemoryViewRequest | undefined }) {
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
        const role = arrow.listRole ?? arrow.label;
        if (role === "prev" && (model.shape === "doubly-linked-list" || model.shape === "queue")) {
          const route = previousListLink(source, target);
          return <path key={`arrow-${index}`} d={route.path} data-pointer-route="prev" className={arrow.dangling ? "dangling-arrow" : "pointer-arrow list-prev-arrow"} markerEnd={arrow.dangling ? "url(#arrow)" : "url(#prev-arrow)"}><title>{`${source.label}.${arrow.label} → ${target.label}${arrow.dangling ? " (freed node)" : ""}`}</title></path>;
        }
        const returning = listReturnLink(model.shape, role, source, target);
        if (returning) return <path key={`arrow-${index}`} d={returning.path} data-pointer-route="return" className={arrow.dangling ? "dangling-arrow" : "pointer-arrow"} markerEnd="url(#arrow)"><title>{`${source.label}.${arrow.label} → ${target.label}${source === target ? " (same node)" : ""}${arrow.dangling ? " (freed node)" : ""}`}</title></path>;
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
      {model.nodes.map(node => <g key={node.address} transform={`translate(${node.x},${node.y})`} className={`${node.freed ? "diagram-node freed-node" : node.orphaned ? "diagram-node orphan-node" : "diagram-node"} ${highlighted === node.address ? "highlighted-node" : ""}${changedHeap.has(node.address) ? " step-changed-node" : ""}`} onClick={() => onHighlight(node.address)}>
        {changedHeap.has(node.address) && <title>{changedHeap.get(node.address)}</title>}
        {node.raw ? <><rect width="126" height="78" rx="7" /><text x="63" y="18" textAnchor="middle">raw block</text>{Array.from({ length: Math.max(1, Math.min(4, Math.ceil(node.size / 4))) }, (_, index) => <g key={index}><line x1={12 + index * 26} y1="25" x2={12 + index * 26} y2="43" className="node-divider" /><text x={25 + index * 26} y="38" textAnchor="middle" className="node-kind">{node.elementType ? node.elementType : "byte"}</text></g>)}<text x="63" y="52" textAnchor="middle" className="node-kind">{node.size} bytes</text></> : model.shape === "tree" && node.treeChildren ? <><rect width="126" height="76" rx="7" /><text x="63" y="22" textAnchor="middle">{node.value}</text>{(["left", "right"] as const).map((side, index) => {
          const child = node.treeChildren![side], x = side === "left" ? 20 : 106;
          return <g key={side}>
            {child === null ? <circle cx={x} cy="18" r="4" className="null-stub" fill="none" stroke="currentColor" /> : child !== undefined ? <text x={x} y="22" textAnchor="middle" className="next-dot">●</text> : null}
            <text x="7" y={42 + index * 12} textAnchor="start" className="node-kind">{node.treeChildAliases?.[index] ?? side} → {child === null ? "NULL" : child === undefined ? "—" : `0x${child.toString(16)}`}</text>
          </g>;
        })}</> : node.listLinks ? <><rect width="126" height="78" rx="7" /><text x="63" y="21" textAnchor="middle">{node.value}</text><text x="8" y="38" className="node-kind">{node.listLinks.names?.next ?? "next"} → {node.listLinks.next}</text><text x="8" y="54" className="node-kind list-prev-label">{node.listLinks.names?.prev ?? "prev"} → {node.listLinks.prev}</text></> : <><rect width="126" height="78" rx="7" /><line x1="63" y1="0" x2="63" y2="54" className="node-divider" />{(node.fields?.length ?? 0) > 1 ? node.fields!.map((field, index) => <text key={field} x="8" y={17 + index * 14} textAnchor="start" className="node-kind">{field}</text>) : <text x="31" y="24" textAnchor="middle">{node.value}</text>}<text x="95" y="24" textAnchor="middle" className="next-dot">●</text><text x="8" y="51" textAnchor="start" className="node-kind">next → {node.next}</text></>}<text x="8" y="70" textAnchor="start" className="node-address"><title>{`Simulated address ${node.label}${node.freed ? `; freed at step ${stepNumber(node.freedAtStep!)}` : ""}`}</title>{node.freed ? `${node.label} freed #${stepNumber(node.freedAtStep!)}` : `@ ${node.label}`}</text>
      </g>)}
    </svg>
    </DiagramViewport>
    {model.nodes.length === 0 && <div className="diagram-empty">No heap blocks to draw at this step. Local variables and arrays appear in the call stack.</div>}
  </div>;
}


const sampleLabels: Record<keyof typeof samples, string> = {
  'graph-traversal': samples['graph-traversal'].name,
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
  const [tour, setTour] = useState<TourStep>();
  const [tourSeen, setTourSeen] = useState(() => { try { return localStorage.getItem(tourPreference) !== null; } catch { return false; } });
  const tourDraft = useRef<(Draft & { restorePreferences: () => void; restoreExecution: () => void })>();
  const [tourChange, setTourChange] = useState<TourChange>();
  const [tourTriedPlay, setTourTriedPlay] = useState(false);
  const [tourTriedSpeed, setTourTriedSpeed] = useState(false);
  const loadedSharedSample = useRef(false);
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
  const [previousDraft, setPreviousDraft] = useState<Draft | undefined>(readPreviousDraft);
  const [runGeneration, setRunGeneration] = useState(0);
  const [selectedConvertedList, setSelectedConvertedList] = useState<{generation: number; name: string; base: number; invocation?: number}>();
  const [selectedHeapMatrix, setSelectedHeapMatrix] = useState<{ generation: number; base: number; name: string; invocation?: number }>();
  const [selectedGraph, setSelectedGraph] = useState<{ generation: number; base: number; name: string; kind?: "list"; invocation?: number }>();
  const [selectedStack, setSelectedStack] = useState<{ generation: number; base: number; name: string; invocation?: number }>();
  const [selectedQueue, setSelectedQueue] = useState<{ generation: number; base: number; name: string; invocation?: number; mode: "linear" | "circular" }>();
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
  const [speedFeedback, setSpeedFeedback] = useState<{ value: number }>();
  useEffect(() => {
    if (!speedFeedback) return;
    const timer = window.setTimeout(() => setSpeedFeedback(undefined), 1600);
    return () => window.clearTimeout(timer);
  }, [speedFeedback]);
  const changePlaybackSpeed = (value: number) => {
    setSpeed(value);
    setSpeedFeedback({ value });
    if (tour === 6 && value !== speed) setTourTriedSpeed(true);
  };
  const togglePlayback = () => {
    if (tour === 6) setTourTriedPlay(true);
    if (trace && !playing && cursor >= trace.steps.length - 1 && tour === 6) setCursor(tourChange ? Math.max(0, tourChange.at - 1) : 0);
    setPlaying(!playing);
  };
  const [score, setScore] = useState(() => readSavedCount("memlens-predict-score")); const [streak, setStreak] = useState(() => readSavedCount("memlens-predict-streak"));
  const emptyRun = Boolean(trace && trace.steps.length === 0);
  const traceLabel = trace ? (emptyRun ? "0 recorded steps" : `step ${stepNumber(cursor)} of ${trace.steps.length}`) : "ready";
  const emptyRunMessage = "Run finished with no recorded steps. A function definition alone does not call it: add a call with your own arguments and setup. Use printf to see a bare expression's value.";
  const displayedSource = practiceSource(lastRun?.code ?? code, lastRun?.setup ?? setup);
  const location = (line: number) => displayedSource.active ? displayedSource.location(line) : `line ${line}`;
  const diagnostic = (message: string) => displayedSource.diagnostic(message);
  const view = trace?.steps[cursor];
  const timeline = useMemo(() => traceMarkers(trace?.steps ?? []), [trace]);
  const { previous: previousEvent, next: nextEvent } = adjacentEvents(timeline.events, cursor);
  const changes = useMemo(() => stepChanges(stale ? undefined : trace?.steps[cursor-1], view), [trace, cursor, stale, view]);
  useEffect(() => { setQuickLook(undefined); }, [view]);
  const allocations = view?.memory.allocations ?? [];
  const baseModel = view ? renderModel(view) : undefined;
  const selectedList = selectedConvertedList?.generation === runGeneration ? selectedConvertedList : undefined;
  const listCandidates = useMemo(() => {
    const candidates = new Map<number, NonNullable<ReturnType<typeof convertedList>>>();
    if (!view) return candidates;
    const addresses = new Set((view.pointers ?? []).filter(p => !p.dangling && !p.from.startsWith("0x")).map(p => p.to));
    for (const node of view.heap ?? []) {
      const fields = node.treeChildAliases;
      if (!fields || !addresses.has(node.address) ||
          !["null", "0"].includes(node.fields[fields[0]]) || !/^\d+$/.test(node.fields[fields[1]] ?? "") ||
          Number(node.fields[fields[1]]) === 0) continue;
      const chain = convertedList(view, node.address);
      if (chain) candidates.set(node.address, chain);
    }
    return candidates;
  }, [view]);
  const selectionStillPointsToHead = selectedList && view?.frames.some(frame =>
    frame.invocation === selectedList.invocation && frame.variables?.[selectedList.name]?.value === String(selectedList.base));
  const chosenList = selectedList && selectionStillPointsToHead ? listCandidates.get(selectedList.base) : undefined;
  const model = view && baseModel && chosenList ? renderConvertedList(view, baseModel, chosenList) : baseModel;
  const customHeapMatrix = selectedHeapMatrix?.generation === runGeneration ? selectedHeapMatrix : undefined;
  const heapMatrixPointer = customHeapMatrix && view?.frames.find(frame => frame.invocation === customHeapMatrix.invocation)?.variables?.[customHeapMatrix.name];
  const heapMatrix = customHeapMatrix && view && heapMatrixPointer?.heapIntRows && Number(heapMatrixPointer.value) === customHeapMatrix.base
    ? readHeapMatrix(view.memory, customHeapMatrix.base) : undefined;
  const arrayStackStep = lastRun?.setup === ""
    && (lastRun.code === samples.stack.code || lastRun.code === starterScaffolds.stack.code) ? view : undefined;
  const customGraph = selectedGraph?.generation === runGeneration ? selectedGraph : undefined;
  const labGraph = lastRun?.code === samples["graph-traversal"].code && lastRun.setup === "";
  const matrix = customGraph
    ? customGraph.kind === "list" ? undefined : view?.frames.flatMap(frame => Object.values(frame.variables ?? {})).find(item => item.array?.base === customGraph.base)?.array
    : labGraph ? view?.frames.find(frame => frame.name === "main")?.variables?.g?.array : undefined;
  const showGraph = Boolean(view && (customGraph || matrix && labGraph));
  const customStack = selectedStack?.generation === runGeneration ? selectedStack : undefined;
  const stackFrame = customStack && view?.frames.find(frame => frame.invocation === customStack.invocation &&
    frame.variables?.[customStack.name]?.array?.base === customStack.base);
  const structStack = customStack && stackFrame?.variables ? readStructStack(stackFrame.variables, customStack.name) : undefined;
  const customQueue = selectedQueue?.generation === runGeneration ? selectedQueue : undefined;
  const queueFrame = customQueue && view?.frames.find(frame => frame.invocation === customQueue.invocation &&
    frame.variables?.[customQueue.name]?.array?.base === customQueue.base);
  const queueVariables = queueFrame?.variables;
  const linearQueue = customQueue?.mode === "linear" && queueVariables ? readLinearQueue(queueVariables, customQueue.name) : undefined;
  const circularQueue = customQueue?.mode === "circular" && queueVariables ? readCircularQueue(queueVariables, customQueue.name) : undefined;
  // Include newly allocated and freed blocks: a pointer can target either.
  // Derive choices from both snapshots, never from the correct answer itself.
  const predictionNodes = prediction && trace ? [...new Map([
    ...allocations, ...trace.steps[predictionTarget].memory.allocations,
  ].map(node => [node.address, node])).values()].sort((a, b) => a.address - b.address) : [];
  const faultStep = fault && trace ? trace.steps.findIndex(step => step.event === "error") : -1;
  const faultReached = Boolean(fault && faultStep >= 0 && cursor >= faultStep);
  const invalidC = fault?.diagnosticKind === "invalid-c";
  const parseFailure = fault?.diagnosticKind === "parse" || invalidC;
  const unsupportedC = fault?.diagnosticKind === "unsupported-c";
  const faultHasInlineLine = /\bline \d+:/.test(error);
  const unresolvedFunction = fault?.diagnosticKind === "unresolved-function";
  const stepExplanation = explainStep(view, { kind: fault?.diagnosticKind, canRewind: cursor > 0 });
  const faultLocation = fault && !((parseFailure || unresolvedFunction || unsupportedC) && faultHasInlineLine) ? location(fault.line) : undefined;
  const moveTo = (next: number, action?: "forward" | "back") => {
    if (!trace) return;
    setPredictionResult(undefined);
    const bounded = Math.max(0, Math.min(next, trace.steps.length - 1));
    if (!tour && predictMode && !stale && bounded > cursor) {
      const question = nextPointerPrediction(trace.steps[cursor], trace.steps[bounded]);
      if (question) { setPredictionTarget(bounded); setPrediction(question); setPlaying(false); return; }
    }
    setPrediction(undefined); setCursor(bounded);
    if (!tour || stale) return;
    if (tour === 3 && action === "forward" && bounded === cursor + 1) {
      const mainFrame = trace.steps[bounded].frames.find(frame => frame.name === "main");
      const delta = mainFrame?.invocation === undefined ? undefined :
        stepChanges(trace.steps[cursor], trace.steps[bounded]).frames.get(mainFrame.invocation)?.get("values");
      if (delta && "cells" in delta) {
        const changed = delta.cells.entries().next().value;
        if (changed) {
          const [index, values] = changed;
          setPlaying(false);
          setTourChange({ at: bounded, index, line: trace.steps[bounded].line, ...values });
          setTour(4);
        }
      }
    } else if (tour === 5 && action === "back" && cursor === tourChange?.at && bounded === cursor - 1) {
      setPlaying(false);
      setTour(6);
    }
  };
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
      if (tour === 2 && result.status === "ok" && result.trace.steps.length > 2) {
        focusStepsAfterRun.current = false;
        setTour(3);
      }
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
        if (tour) { event.preventDefault(); finishTour(); return; }
      }
      const runAction = workspaceRunShortcut(event);
      if (runAction) { event.preventDefault(); runCode(runAction === "run-and-play"); return; }
      const speedAction = playbackSpeedShortcut(event);
      if (speedAction !== undefined) {
        event.preventDefault();
        changePlaybackSpeed(stepPlaybackSpeed(speed, speedAction));
        return;
      }
      if (!trace || trace.steps.length < 2 || !shouldHandlePlaybackShortcut(event)) return;
      if (!["ArrowLeft", "ArrowRight", " ", "Home", "End"].includes(event.key)) return;
      // A playback action replaces the key's native page-scroll behavior.
      event.preventDefault();
      if (event.key === "ArrowLeft") moveTo(cursor - 1, "back");
      else if (event.key === "ArrowRight") moveTo(cursor + 1, "forward");
      else if (event.key === " " && !event.repeat) togglePlayback();
      else if (event.key === "Home") moveTo(0);
      else if (event.key === "End") moveTo(trace.steps.length - 1);
    };
    window.addEventListener("keydown", onSpotlight, true);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onSpotlight, true); window.removeEventListener("keydown", onKey); };
  }, [trace, cursor, predictMode, stale, code, stdin, setup, inputMode, spotlight, focusPane, quickLook, help, visualizer.expanded, visualizer.fullscreen, tour, tourChange, speed, playing]);
  useEffect(() => { if (tour) return; try { localStorage.setItem("memlens-code", code); } catch { /* storage is optional */ } }, [code, tour]);
  useEffect(() => { if (tour) return; try { localStorage.setItem("memlens-test-setup", setup); } catch { /* storage is optional */ } }, [setup, tour]);
  const replaceDraft = (nextCode: string, nextSetup: string) => {
    session.current = undefined; setWaiting(false); setTranscript(""); setConsoleError("");
    setCode(nextCode); setSetup(nextSetup); setLastRun(undefined); setTrace(undefined); setExecutionMode(undefined);
    setFault(undefined); setError(""); setLeaks([]); setPlaying(false); setPrediction(undefined); setPredictionResult(undefined); setCursor(0); setHighlightedAddress(undefined);
  };
  const savePreviousDraft = (draft: Draft | undefined) => {
    // Save synchronously before replacing the active source; a reload can
    // happen before passive effects run.
    try {
      if (draft) localStorage.setItem(previousDraftKey, JSON.stringify(draft));
      else localStorage.removeItem(previousDraftKey);
    } catch { /* the in-memory restore control is still available */ }
    setPreviousDraft(draft);
  };
  const markTourSeen = () => {
    setTourSeen(true);
    try { localStorage.setItem(tourPreference, "yes"); } catch { /* the current session still remembers */ }
  };
  const revealEditor = () => requestAnimationFrame(() => {
    const content = workspace.current?.querySelector<HTMLElement>(".cm-content");
    content?.focus({ preventScroll: true });
    content?.scrollIntoView?.({ block: "center" });
  });
  const finishTour = (focusEditor = true) => {
    const original = tourDraft.current;
    tourDraft.current = undefined;
    setTourChange(undefined);
    if (original) {
      replaceDraft(original.code, original.setup);
      original.restorePreferences();
      if (focusEditor) original.restoreExecution();
    }
    setTour(undefined);
    markTourSeen();
    if (focusEditor) revealEditor();
    return original;
  };
  const startTour = () => {
    if (tour) { closeHelp(); return; }
    if ((selectedSample === "custom" || linkedSample || loadedSharedSample.current) &&
        !window.confirm("Temporarily show the tour example? Your code and test setup will return when you exit or reload.")) return;
    // Leave the stored draft alone. Reloading mid-tour returns directly to it.
    const previousSession = session.current;
    tourDraft.current = {
      code, setup,
      restorePreferences: () => {
        setInputMode(inputMode); setStdin(stdin); setSpeed(speed); setSpeedFeedback(undefined); setPredictMode(predictMode);
        setSplitSizes(splitSizes); setActiveLayout(activeLayout); setFocusPane(focusPane);
        setOutputExpanded(outputExpanded);
        visualizer.restorePresentation(visualizer.fullscreen, visualizer.expanded);
      },
      restoreExecution: () => {
        session.current = previousSession;
        setTrace(trace); setCursor(cursor); setLastRun(lastRun); setExecutionMode(executionMode);
        setFault(fault); setError(error); setLeaks(leaks); setWaiting(waiting); setTranscript(transcript);
        setConsoleError(consoleError); setRunGeneration(runGeneration); setPlaying(playing);
        setPrediction(prediction); setPredictionResult(predictionResult); setPredictionTarget(predictionTarget);
        setSelectedConvertedList(selectedConvertedList);
        setSelectedGraph(selectedGraph); setSelectedStack(selectedStack); setSelectedQueue(selectedQueue); setSelectedHeapMatrix(selectedHeapMatrix);
        setHighlightedAddress(highlightedAddress);
      },
    };
    setTourTriedPlay(false); setTourTriedSpeed(false); setSpeedFeedback(undefined);
    setSpeed(1);
    if (visualizer.expanded) visualizer.closeExpanded(false);
    if (visualizer.fullscreen) void visualizer.exitFullscreen();
    setFocusPane(undefined);
    setHelp(false);
    replaceDraft(quickTourSource, "");
    setInputMode("ahead");
    setTour(1);
  };
  const changeTourStep = (next: TourStep) => {
    setPlaying(false);
    if (next === 3 && tourChange) setCursor(Math.max(0, tourChange.at - 1));
    if ((next === 4 || next === 5) && tourChange) setCursor(tourChange.at);
    setTour(next);
  };
  const skipTourStep = () => {
    if (!tour || tour === 7) return;
    if (tour === 2 && !trace) { runCode(); return; }
    if (tour === 3 && trace) {
      // A skipped forward step still lands on a real recorded change when
      // available; never present an invented value or memory difference.
      for (let index = 1; index < trace.steps.length; index++) {
        const frame = trace.steps[index].frames.find(candidate => candidate.name === "main");
        const delta = frame?.invocation === undefined ? undefined :
          stepChanges(trace.steps[index-1], trace.steps[index]).frames.get(frame.invocation)?.get("values");
        if (!delta || !("cells" in delta)) continue;
        const changed = delta.cells.entries().next().value;
        if (!changed) continue;
        const [cell, values] = changed;
        setPlaying(false); setCursor(index);
        setTourChange({at:index,index:cell,line:trace.steps[index].line,...values}); setTour(4); return;
      }
      changeTourStep(6);
      return;
    }
    changeTourStep((tour+1) as TourStep);
  };
  const showTourWelcome = !tourSeen && !linkedSample && !loadedSharedSample.current && !tour;
  useEffect(() => {
    if (!showTourWelcome) return;
    // Do not hide the current card. Only prevent an automatic offer in
    // later visits, including a reload with no choice made.
    try {
      if (localStorage.getItem(tourPreference) === null) localStorage.setItem(tourPreference, "offered");
    } catch { /* normal use and the Help entry still work */ }
  }, [showTourWelcome]);
  const useOwnCode = () => {
    markTourSeen(); setFocusPane(undefined); revealEditor();
  };
  const selectSample = (key: keyof typeof samples) => {
    const original = tour ? finishTour(false) : undefined;
    const candidate = original ?? { code, setup };
    if (!Object.entries(samples).some(([id, sample]) => sample.code === candidate.code && candidate.setup === (id === "tree-height" ? treeHeightSetup : ""))) savePreviousDraft(candidate);
    loadedSharedSample.current = false;
    setSample(key); replaceDraft(samples[key].code, key === "tree-height" ? treeHeightSetup : "");
  };
  const loadLinkedSample = () => {
    if (!linkedSample || (selectedSample === "custom" && !window.confirm("Replace the current code and test setup with this sample?"))) return;
    if (linkedSample !== selectedSample) selectSample(linkedSample);
    loadedSharedSample.current = true;
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
  const useStarter = (key: StarterKey) => { const original = tour ? finishTour(false) : undefined; if (original) savePreviousDraft(original); else if (!previousDraft || selectedSample === "custom") savePreviousDraft({ code, setup }); replaceDraft(starterScaffolds[key].code, ""); };
  const restoreDraft = () => { if (previousDraft) { // Swap edited source rather than throwing it away on Restore.
    const edited = selectedSample === "custom" && !Object.values(starterScaffolds).some(starter => starter.code === code && setup === "");
    replaceDraft(previousDraft.code, previousDraft.setup);
    savePreviousDraft(edited ? { code, setup } : undefined); } };
  const lines = useMemo(() => code.split(/\r?\n/), [code]);
  const spotlightDialog = spotlight && <Spotlight items={spotlightItems} onClose={closeSpotlight} onSelect={item => { if (item.action() !== false) closeSpotlight(); }} />;
  const tourHint = tour && !help && !spotlight && !quickLook && <QuickTourHint workspace={workspace} step={tour} change={tourChange}
    triedPlay={tourTriedPlay} triedSpeed={tourTriedSpeed} anchorVersion={tour === 4 ? cursor : undefined}
    onReveal={() => { if (tour === 4 && tourChange) setCursor(tourChange.at); }}
    onExit={() => finishTour()} onBack={() => changeTourStep((tour - 1) as TourStep)}
    onNext={() => changeTourStep(tour === 4 ? 5 : 7)} onSkip={skipTourStep} />;
  const helpDialog = help && <WorkspaceHelp onClose={closeHelp} reportProblem={reportProblem} onQuickTour={startTour} />;
  return <main ref={workspace} data-tour-step={tour} tabIndex={-1} aria-label="Code execution workspace">
    <header><div className="brand"><img className="brand-mark" src="/memlens-mark.svg" width="36" height="36" alt="" aria-hidden="true" /> MEMLENS</div><div className="tag">Step through your C code and watch memory rewind.</div>
      <select ref={samplesPicker} aria-label="Samples" value={selectedSample} onChange={e => { if (e.target.value !== "custom") selectSample(e.target.value as keyof typeof samples); }}><option value="custom" disabled>Custom code (current editor contents)</option>{Object.entries(sampleLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
      <button type="button" className="spotlight-trigger" aria-keyshortcuts="Control+k Meta+k" onClick={event => { showSpotlight(); spotlightTrigger.current = event.currentTarget; }}>Spotlight <kbd>Ctrl / ⌘ K</kbd></button><button className="run" onClick={() => runCode()} title="Run code (Ctrl / ⌘ + Enter)" aria-keyshortcuts="Control+Enter Meta+Enter">Run</button></header>
    <SectionNavigation onOpenHelp={showHelp} helpOpen={help} onRun={() => runCode()} />
    {showTourWelcome && <QuickTourWelcome onStart={startTour} onSkip={useOwnCode} />}
    {tourHint}
    {!trace && !error && !tour && (tourSeen || linkedSample || loadedSharedSample.current) && <p className="launch-quickstart">Paste your own C code or choose a sample. Select <strong>Run</strong>, then step forward or backward in <strong>Trace</strong>.</p>}
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
    <section className={`workspace ${inputMode === "interactive" ? "interactive-workspace" : ""}${effectiveFocus ? " has-focus" : ""}`} style={splitStyle}><div className="code-panel" id="code" tabIndex={-1} aria-label="Code section" hidden={Boolean(effectiveFocus && effectiveFocus !== "code")}><button className="pane-focus" type="button" onClick={() => toggleFocus("code")}>{focusPane === "code" ? "Restore workspace" : "Focus code"}</button><div className="panel-title">SOURCE <small>{lines.length} lines · edit a sample or paste your own C code</small></div><details className="starter-picker"><summary>Start from a scaffold</summary><StarterScaffolds onUse={useStarter} /></details><label className="input-mode">Program input <select aria-label="Input mode" value={inputMode} onChange={event => setInputMode(event.target.value as "ahead" | "interactive")}><option value="ahead">Input ahead (stdin)</option><option value="interactive">Interactive console</option></select></label>{previousDraft && !tour && <button type="button" className="restore-draft" onClick={restoreDraft}>Restore previous draft</button>}<div data-tour-target={tour === 1 ? "editor" : undefined} onFocusCapture={event => { if (tour === 1 && (event.target as HTMLElement).matches(".cm-content")) setTour(2); }}><CodeEditor onRun={() => runCode()} onRunAndPlay={() => runCode(true)} value={code} currentLine={stale || (displayedSource.active && (view?.line ?? 0) >= displayedSource.setupStart) ? undefined : view?.line} onChange={value => { if (!tour || value === quickTourSource) setCode(value); else { const original = finishTour(false); if (original) savePreviousDraft(original); setCode(value); setSetup(""); } }} /></div>

      <details className="practice-setup" open={setup.trim().length > 0 || undefined}>
        <summary>Test setup &amp; call (optional)</summary>
        <p>Keep your types and function above. Add input declarations and an explicit function call here. This code runs after your source, without a main() wrapper. Nothing is guessed. Clear this area for a full main() program.</p>
        <label htmlFor="test-setup">C test setup</label>
        <textarea id="test-setup" aria-label="C test setup" spellCheck={false} value={setup} onChange={event => { const value = event.target.value; if (tour) { const original = finishTour(false); if (original) savePreviousDraft(original); } setSetup(value); }} placeholder={'int values[] = {3, 1, 2};\nprintf("%d", sum(values, 3));'} />
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
      <div className="timeline" id="trace" tabIndex={-1} aria-label="Trace section"><div className="panel-title">TRACE <small>{traceLabel}</small></div><p className="step-explanation">{emptyRun ? emptyRunMessage : displayedSource.active && view ? diagnostic(stepExplanation).replace(/^Line \d+/, location(view.line)) : stepExplanation}</p>{waiting && !stale && <a className="waiting-console-link" href="#console" onClick={event => {
        event.preventDefault();
        const reveal = () => {
          if (document.fullscreenElement === visualizer.panel.current) return;
          setFocusPane(undefined);
          setConsoleReveal(request => request + 1);
        };
        if (visualizer.expanded) visualizer.closeExpanded(false);
        if (visualizer.fullscreen) void visualizer.exitFullscreen().then(reveal);
        else reveal();
      }}>Waiting for input · Open console ↓</a>}<div className="timeline-track">
          <input aria-label="Timeline" aria-valuetext={traceLabel} type="range" min="0" max={Math.max(0, (trace?.steps.length ?? 1) - 1)} value={cursor} onChange={e => moveTo(Number(e.target.value))} disabled={!trace || emptyRun} />
          {trace && timeline.indexes.map(index => {
            const kind = trace.steps[index].event ?? "step";
            return <button type="button" tabIndex={-1} data-trace-index={index} aria-label={`${kind} tick ${stepNumber(index)}`}
              className={`event-tick tick-${kind}`} style={{ left: `${trace.steps.length > 1 ? index / (trace.steps.length - 1) * 100 : 0}%` }}
              key={index} onMouseDown={event => event.preventDefault()} onClick={() => moveTo(index)} />;
          })}
        </div><div className="controls"><button data-playback-speed-keys="true" data-tour-target={tour === 6 && !tourTriedPlay ? "play" : undefined} aria-keyshortcuts="Space" disabled={(trace?.steps.length ?? 0) < 2} onClick={togglePlayback}>{playing ? "Pause" : "Play"} ▶</button><button data-step-navigation="true" data-playback-speed-keys="true" aria-keyshortcuts="ArrowLeft" disabled={(trace?.steps.length ?? 0) < 2} data-tour-target={tour === 5 ? "rewind" : undefined} onClick={() => moveTo(cursor - 1, "back")}>← step back</button><button data-step-navigation="true" data-playback-speed-keys="true" aria-keyshortcuts="ArrowRight" title="Use Left/Right arrow keys to step" disabled={(trace?.steps.length ?? 0) < 2} data-tour-target={tour === 3 ? "forward" : undefined} onClick={() => moveTo(cursor + 1, "forward")}>step forward →</button><select data-tour-target={tour === 6 && tourTriedPlay ? "speed" : undefined} aria-label="Playback speed" value={speed} onChange={e => changePlaybackSpeed(Number(e.target.value))}>{playbackSpeeds.map(value => <option key={value} value={value}>{value}×</option>)}</select><label className="predict-toggle"><input type="checkbox" disabled={stale} checked={predictMode} onChange={e => { setPredictMode(e.target.checked); setPrediction(undefined); setPredictionResult(undefined); }} /> Predict</label>{(trace?.steps.length ?? 0) > 1 && timeline.events.length > 0 && <>
          <button type="button" disabled={previousEvent === undefined} onClick={() => { if (previousEvent !== undefined) moveTo(previousEvent); }}>Previous event</button>
          <button type="button" disabled={nextEvent === undefined} onClick={() => { if (nextEvent !== undefined) moveTo(nextEvent); }}>Next event</button>
        </>}<span>{view ? `${location(view.line)} · ${view.event ?? "step"}` : emptyRun ? "Run finished · no recorded steps" : "No trace loaded"} · score {score} · streak {streak}</span></div><p className="speed-feedback" aria-live="polite" aria-atomic="true">{speedFeedback && `Playback speed: ${speedFeedback.value}×`}</p>{prediction && <div className="prediction"><b>Where will {prediction.label} point after this line?</b><button disabled={predictionResult !== undefined} onClick={() => answerPrediction(null)}>NULL</button>{predictionNodes.map(node => <button key={node.address} disabled={predictionResult !== undefined} onClick={() => answerPrediction(node.address)}>{`0x${node.address.toString(16)}`}{node.freeStep !== undefined ? " (freed)" : !allocations.some(allocation => allocation.address === node.address) ? " (new block)" : ""}</button>)}{predictionResult !== undefined && <strong className={predictionResult ? "correct" : "incorrect"}>{predictionResult ? "Correct!" : "Not quite"}</strong>}</div>}</div>
        <div className={`columns${!model?.nodes.length && !arrayStackStep && !showGraph && !customQueue && !customStack && !customHeapMatrix ? " empty-heap" : ""}`}>
          <div className="heap-column">
            <h3>{arrayStackStep || showGraph || customQueue || customStack || customHeapMatrix ? "DATA STRUCTURE" : "HEAP STRUCTURE"} <small>{showGraph ? "graph" : customQueue ? "queue" : arrayStackStep || customStack ? "stack" : customHeapMatrix ? "matrix" : model?.shape ?? "ready"}</small></h3>
            {selectedList && <div className="view-guide">
              <button type="button" className="graph-trigger" onClick={() => setSelectedConvertedList(undefined)}>Back to automatic heap view</button>
              <div role="status">{chosenList
                ? `List from ${selectedList.name}: ${chosenList.fields[0]} is previous, ${chosenList.fields[1]} is next.`
                : `The selected list from ${selectedList.name} is not complete at this step. Showing the recorded heap instead.`}</div>
            </div>}
            {customHeapMatrix && <HeapMatrixDiagram name={customHeapMatrix.name} matrix={heapMatrix} onClose={() => setSelectedHeapMatrix(undefined)} />}
            {arrayStackStep && <ArrayStackDiagram stack={readArrayStack(arrayStackStep)} />}
            {customStack && <StructStackDiagram name={customStack.name} stack={structStack} onClose={() => setSelectedStack(undefined)} />}
            {customQueue?.mode === "linear" && <StructQueueDiagram name={customQueue.name} queue={linearQueue} onClose={() => setSelectedQueue(undefined)} />}
            {customQueue?.mode === "circular" && <StructCircularQueueDiagram name={customQueue.name} queue={circularQueue} onClose={() => setSelectedQueue(undefined)} />}
            {showGraph && view && <GraphDiagram
              key={`${runGeneration}:${customGraph?.base ?? "lab"}`}
              name={customGraph?.name ?? "g"} array={matrix} step={view}
              listSelection={customGraph?.kind === "list" ? customGraph : undefined}
              exactLab={labGraph && customGraph === undefined}
              onClose={customGraph ? () => setSelectedGraph(undefined) : undefined} />}
            {((!arrayStackStep && !showGraph && !customQueue && !customStack && !customHeapMatrix) || Boolean(model?.nodes.length && !customHeapMatrix)) && (model
              ? <StructureDiagram model={model} highlighted={highlightedAddress} onHighlight={setHighlightedAddress} memoryViewRequest={memoryViewRequest} changedHeap={changes.heap} />
              : <div className="diagram-empty">{emptyRun ? "No heap activity was recorded." : "Run a program to visualize its structure."}</div>)}
            <div className="heap-summary">{allocations.filter(allocation => allocation.freeStep === undefined).length} live · {allocations.filter(allocation => allocation.freeStep !== undefined).length} freed{!customHeapMatrix && ` · ${baseModel?.nodes.filter(node => node.orphaned).length ?? 0} orphaned`}</div>
          </div>
          <div><h3>CALL STACK</h3><div className="stack-visual"><div className="stack-label">Active functions and local variables</div>{view && <p className="view-guide">Matrices show rows and columns here. When a variable supports another view, use its <strong>View as</strong> button here.</p>}{view && view.frames.slice().reverse().map((frame, frameIndex) => <div key={frameKey(frame.invocation, frame.name, view.frames.length-1-frameIndex)} className="frame" data-invocation={frame.invocation}>
              <small className="frame-name">{frame.invocation === -1 ? "File scope" : executionMode === "snippet" && frameIndex === view.frames.length - 1 ? "snippet" : `${frame.name}()`}</small>
              {Object.entries(frame.variables ?? {}).map(([key, variable]) => {
                const change = frame.invocation === undefined ? undefined : changes.frames.get(frame.invocation)?.get(key);
                const list = variable.pointer && !variable.stringPointer ? listCandidates.get(Number(variable.value)) : undefined;
                const candidate = !labGraph && variable.array && graphSize(variable.array) > 0 ? variable.array : undefined;
                return <div className={`stack-slot ${variable.pointer ? "pointer-slot" : ""}${change ? " step-changed-slot" : ""}`} key={key}
                  title={`${variable.type} ${key}`}
                  onMouseEnter={() => variable.pointer && setHighlightedAddress(!variable.stringPointer && variable.value !== "null" ? Number(variable.value) : undefined)}
                  onClick={() => variable.pointer && setHighlightedAddress(!variable.stringPointer && variable.value !== "null" ? Number(variable.value) : undefined)}>
                  <span><b>{key}</b><small>{variable.type}</small></span>
                  <StackValue name={key} variable={variable} change={change} generation={runGeneration} tourCell={tour === 4 && cursor === tourChange?.at && key === "values" ? tourChange.index : undefined} />
                  {candidate && <button type="button" className="graph-trigger" aria-pressed={customGraph?.base === candidate.base}
                    onClick={() => { setSelectedConvertedList(undefined); setSelectedQueue(undefined); setSelectedStack(undefined); setSelectedHeapMatrix(undefined); setSelectedGraph({generation:runGeneration, base:candidate.base, name:key}); }}>View {key} as graph</button>}
                  {variable.array && variable.adjacencyShape && <button type="button" className="graph-trigger"
                    aria-pressed={customGraph?.kind === "list" && customGraph.base === variable.array.base && customGraph.invocation === frame.invocation}
                    onClick={() => {
                      setSelectedConvertedList(undefined); setSelectedQueue(undefined); setSelectedStack(undefined); setSelectedHeapMatrix(undefined);
                      setSelectedGraph({generation:runGeneration, base:variable.array!.base, name:key, invocation:frame.invocation, kind:"list"});
                    }}>View {key} as adjacency list</button>}
                  {variable.array && frame.variables && canShowLinearQueue(frame.variables, key) &&
                    <button type="button" className="graph-trigger" aria-pressed={customQueue?.mode === "linear" && customQueue.base === variable.array.base} onClick={() => {
                      setSelectedConvertedList(undefined);
                      setSelectedGraph(undefined);
                      setSelectedHeapMatrix(undefined);
                      setSelectedStack(undefined);
                      setSelectedQueue({ generation:runGeneration, base:variable.array!.base, name:key, invocation:frame.invocation, mode:"linear" });
                    }}>View {key} as linear queue</button>}
                  {variable.array && frame.variables && readCircularQueue(frame.variables, key) &&
                    <button type="button" className="graph-trigger" aria-pressed={customQueue?.mode === "circular" && customQueue.base === variable.array.base} onClick={() => {
                      setSelectedConvertedList(undefined);
                      setSelectedGraph(undefined);
                      setSelectedHeapMatrix(undefined);
                      setSelectedStack(undefined);
                      setSelectedQueue({ generation:runGeneration, base:variable.array!.base, name:key, invocation:frame.invocation, mode:"circular" });
                    }}>View {key} as circular queue</button>}
                  {variable.array && frame.variables && readStructStack(frame.variables, key) &&
                    <button type="button" className="graph-trigger" aria-pressed={customStack?.base === variable.array.base} onClick={() => {
                      setSelectedConvertedList(undefined);
                      setSelectedGraph(undefined);
                      setSelectedHeapMatrix(undefined);
                      setSelectedQueue(undefined);
                      setSelectedStack({ generation:runGeneration, base:variable.array!.base, name:key, invocation:frame.invocation });
                    }}>View {key} as stack</button>}
                  {list && <button type="button" className="graph-trigger"
                    aria-pressed={chosenList?.head === list.head && selectedList?.name === key && selectedList.invocation === frame.invocation}
                    onClick={() => {
                      setSelectedGraph(undefined); setSelectedQueue(undefined); setSelectedStack(undefined); setSelectedHeapMatrix(undefined);
                      setSelectedConvertedList({generation:runGeneration, name:key, base:list.head, invocation:frame.invocation});
                    }}>View {key} as doubly linked list</button>}
                  {variable.heapIntRows && <button type="button" className="graph-trigger"
                    aria-pressed={customHeapMatrix?.name === key && customHeapMatrix.invocation === frame.invocation && customHeapMatrix.base === Number(variable.value)}
                    onClick={() => {
                      setSelectedConvertedList(undefined);
                      setSelectedGraph(undefined);
                      setSelectedQueue(undefined);
                      setSelectedStack(undefined);
                      setSelectedHeapMatrix({generation:runGeneration, base:Number(variable.value), name:key, invocation:frame.invocation});
                    }}>View {key} as heap matrix</button>}
                  {variable.pointer && <button className="quick-look-trigger" type="button" aria-label={`Quick Look pointer ${key}`} onClick={event => { event.stopPropagation(); setPlaying(false); setQuickLook({ name:key, variable, step:view, trigger:event.currentTarget }); }}>Quick Look</button>}
                </div>;
              })}
            </div>)}{!view && <div className="diagram-empty">{emptyRun ? "No variables or calls were recorded." : "Run a program to inspect its function calls and variables."}</div>}</div></div>
        </div>
        {error && !fault && <div className="crime" role="alert"><b>PROGRAM COULD NOT RUN</b><span>{diagnostic(error)}</span></div>}
        {fault && !faultReached && faultStep >= 0 && <div className="error-ahead">Error ahead at step {stepNumber(faultStep)}</div>}
        {fault && faultReached && <div className="crime" role="alert">
          <b>{unsupportedC ? "NOT SUPPORTED IN MEMLENS" : invalidC ? "C SYNTAX ERROR" : parseFailure ? "COULD NOT READ C CODE" : unresolvedFunction ? "FUNCTION NOT RESOLVED" : "EXECUTION ERROR"}</b>
          <span>{diagnostic(error)}{faultLocation && ` · ${faultLocation}`}</span>
          {(unresolvedFunction || unsupportedC || parseFailure) && <a href="https://github.com/gagang2109/Memlens#supported-c-subset" target="_blank" rel="noopener noreferrer">Supported C subset ↗</a>}
          {fault.allocation && <>
            <button onClick={() => setCursor(fault.allocation!.allocStep)}>alloc {location(fault.allocation.line)}</button>
            {fault.allocation.freeStep !== undefined && <button onClick={() => setCursor(fault.allocation!.freeStep!)}>free step {stepNumber(fault.allocation.freeStep)}</button>}
          </>}
          {!parseFailure && !unresolvedFunction && !unsupportedC && <button onClick={() => setCursor(faultStep)}>access {location(fault.line)}</button>}
        </div>}
        {!fault && leaks.length > 0 && <div className="leak-report"><b>MEMORY NOT FREED AT EXIT</b><span>{leaks.length} block{leaks.length === 1 ? " was" : "s were"} never freed.</span>{leaks.map(leak => <small key={leak.address}>allocation {location(leak.line)}</small>)}</div>}
        {quickLook && quickLook.step === view && <PointerQuickLook {...quickLook} onClose={closeQuickLook} />}
        {visualizer.fullscreen && (helpDialog || spotlightDialog)}
      </div><SplitDivider boundary={1} sizes={splitSizes} onSize={onSplitSizes}/>
      <div className="terminal-panel" hidden={Boolean(effectiveFocus && effectiveFocus !== "terminal")}><ConsoleWindow dockRequest={dockRequest} revealRequest={consoleReveal} focused={focusPane === "terminal"} onFocusPane={() => toggleFocus("terminal")} waiting={waiting && !stale}>{inputMode === "interactive" && <InteractiveConsole key={runGeneration} revealRequest={consoleReveal} outputExpanded={outputExpanded} onToggleOutput={toggleOutput} output={view?.stdout ?? ""} waiting={waiting} active={Boolean(lastRun)} stale={stale} atLatest={cursor === (trace?.steps.length ?? 0) - 1} transcript={transcript} error={consoleError} onSubmit={submitInteractive} onEOF={() => submitInteractive()} onLatest={() => { setPlaying(false); setCursor(Math.max(0, (trace?.steps.length ?? 1) - 1)); }} onStop={() => { session.current = undefined; setWaiting(false); setPlaying(false); setConsoleError("Stopped. The recorded trace remains available; Run starts a new session."); }} />}{inputMode === "ahead" && <div className="console"><div className="panel-title">CONSOLE</div><label className="stdin-label">Program input (scanf) <input aria-label="Standard input" value={stdin} onChange={event => setStdin(event.target.value)} placeholder="e.g. 3 10 20 30 (space-separated)" /></label><ConsoleOutput expanded={outputExpanded} onToggle={toggleOutput}>{view ? view.stdout || "No output printed at this step." : emptyRun ? "Run finished without printed output." : "Run a program to see its printed output (printf)."}</ConsoleOutput></div>}</ConsoleWindow></div></section>
    {!visualizer.fullscreen && (helpDialog || spotlightDialog)}
    <footer><a href="https://github.com/gagang2109/Memlens" target="_blank" rel="noopener noreferrer">Memlens on GitHub ↗</a> · <a href={reportProblem} target="_blank" rel="noopener noreferrer">Report a problem ↗</a> · supports a subset of C, not a full C compiler · addresses and memory are simulated</footer>
  </main>;
}


