import { useEffect, useRef, useState } from "react";
import { EditorState, StateEffect, StateField, Prec } from "@codemirror/state";
import { EditorView, Decoration, type DecorationSet, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } from "@codemirror/view";
import { cpp } from "@codemirror/lang-cpp";
import { oneDark } from "@codemirror/theme-one-dark";

import { toggleComment, redo, history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";

// CodeMirror may receive the shifted character A or an explicit Shift+a.
const alternateComment = { keys: ["Alt-A", "Alt-Shift-a"], label: "Alt + Shift + A" };

// Only load features used by this C-subset editor, not completion or lint engines.
const editorSetup = [
  lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(),
  drawSelection(), highlightActiveLine(), history(), indentOnInput(),
  bracketMatching(), highlightSelectionMatches(),
  keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
];

const setCurrentLine = StateEffect.define<number | null>();
const currentLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) if (effect.is(setCurrentLine)) {
      value = effect.value === null ? Decoration.none : Decoration.set([Decoration.line({ class: "cm-memlens-current" }).range(transaction.state.doc.line(effect.value).from)]);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});

export function CodeEditor({ value, currentLine: line, onChange, onRun, onRunAndPlay }: { value: string; currentLine?: number; onChange: (value: string) => void; onRun?: () => void; onRunAndPlay?: () => void }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const host = useRef<HTMLDivElement>(null); const view = useRef<EditorView>();
  const onRunRef = useRef(onRun); onRunRef.current = onRun;
  const onRunAndPlayRef = useRef(onRunAndPlay); onRunAndPlayRef.current = onRunAndPlay;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({ doc: value, extensions: [editorSetup, cpp(), oneDark, currentLine,
      EditorView.contentAttributes.of({ "aria-label": "C source editor", "aria-describedby": "editor-keyboard-hint", "aria-keyshortcuts": "Shift+Enter" }),
      Prec.highest(keymap.of([
        { key: "Ctrl-Enter", mac: "Meta-Enter", run: () => { if (!onRunRef.current) return false; onRunRef.current(); return true; } },
        { key: "Shift-Enter", run: () => { if (!onRunAndPlayRef.current) return false; onRunAndPlayRef.current(); return true; } },
        { key: "Mod-/", run: toggleComment },
        ...alternateComment.keys.map(key => ({ key, run: toggleComment })),
        { key: "Mod-Shift-z", run: redo },
      ])), EditorView.lineWrapping, EditorView.updateListener.of(update => { if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      if (update.selectionSet || update.docChanged) {
        const cursor = update.state.selection.main.head;
        const selectedLine = update.state.doc.lineAt(cursor);
        setPosition({ line: selectedLine.number, column: cursor - selectedLine.from + 1 });
      } })] });
    view.current = new EditorView({ state, parent: host.current });
    return () => { view.current?.destroy(); view.current = undefined; };
  }, []);
  useEffect(() => {
    const editor = view.current; if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);
  useEffect(() => {
    const editor = view.current; if (!editor) return;
    const activeLine = line && line > 0 && line <= editor.state.doc.lines ? line : null;
    editor.dispatch({ effects: setCurrentLine.of(activeLine) });
    editor.requestMeasure({
      key: setCurrentLine,
      read: current => {
        const scroller = current.scrollDOM;
        if (activeLine === null || activeLine > current.state.doc.lines || scroller.clientHeight === 0) return null;
        const block = current.lineBlockAt(current.state.doc.line(activeLine).from);
        const { top } = scroller.getBoundingClientRect();
        const origin = current.documentTop - top - scroller.clientTop;
        const blockTop = origin + block.top;
        const blockBottom = origin + block.bottom;
        // Follow the trace within the editor, without moving the caret or scrolling the page.
        const delta = blockTop < 0 ? blockTop : blockBottom > scroller.clientHeight
          ? Math.min(blockTop, blockBottom - scroller.clientHeight) : 0;
        return delta === 0 ? null : scroller.scrollTop + delta;
      },
      write: (top, current) => { if (top !== null) current.scrollDOM.scrollTop = top; },
    });
  }, [line]);
  return <div className="editor-shell">
    <div className="editor-toolbar"><span className="editor-file">main.c <small>C subset</small></span></div>
    <div className="code-editor" ref={host} />
    <div className="editor-status"><span>Ln {position.line}, Col {position.column}</span><span id="editor-keyboard-hint">Ctrl / ⌘ + / comments · Shift + Enter runs and plays · Tab leaves editor</span><button type="button" aria-expanded={helpOpen} aria-controls="editor-shortcuts" onClick={() => setHelpOpen(open => !open)}>Keyboard shortcuts</button></div>
    {helpOpen && <section className="editor-shortcuts" id="editor-shortcuts" aria-label="Editor keyboard shortcuts">
      <strong>Code comfortably</strong>
      <p>Use Ctrl on Windows/Linux, or ⌘ on Mac, for “Mod” below. Shortcuts work while the editor is focused.</p>
      <dl>{[
        ["Mod + Enter", "Run code"],
        ["Shift + Enter", "Run code and start playback"],
        ["Mod + /", "Toggle comment on selected lines"],
        [alternateComment.label, "Toggle comment on selected lines"],
        ["Mod + Z / Mod + Shift + Z", "Undo / redo"],
        ["Mod + F", "Open Find and Replace"],
        ["Mod + A", "Select all code"],
        ["Mod + [ / Mod + ]", "Indent less / more"],
        ["Alt + ↑ / ↓", "Move selected lines up / down"],
        ["Enter", "New line with automatic indentation"],
        ["Tab / Shift + Tab", "Move focus to the next / previous control"],
      ].map(([keys, action]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>)}</dl>
      <p>While stepping outside the editor, use Left/Right to move between steps. Space plays or pauses, and Home/End jump to the ends when not focused on an interactive control.</p>
      <p>Syntax highlighting and bracket matching help you edit; this is a supported C subset, not a full C compiler.</p>
      <button type="button" onClick={() => { setHelpOpen(false); view.current?.focus(); }}>Close guide and return to code</button>
    </section>}
  </div>;
}
