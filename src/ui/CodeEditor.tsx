import { useEffect, useRef, useState } from "react";
import { EditorState, StateEffect, StateField, Prec } from "@codemirror/state";
import { EditorView, Decoration, type DecorationSet, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } from "@codemirror/view";
import { cpp } from "@codemirror/lang-cpp";
import { oneDark } from "@codemirror/theme-one-dark";

import { toggleComment, redo, history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";

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

export function CodeEditor({ value, currentLine: line, onChange }: { value: string; currentLine?: number; onChange: (value: string) => void }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const host = useRef<HTMLDivElement>(null); const view = useRef<EditorView>();
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({ doc: value, extensions: [editorSetup, cpp(), oneDark, currentLine,
      EditorView.contentAttributes.of({ "aria-label": "C source editor", "aria-describedby": "editor-keyboard-hint" }),
      Prec.highest(keymap.of([
        { key: "Mod-/", run: toggleComment },
        { key: "Alt-A", run: toggleComment },
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
    const effect = line && line > 0 && line <= editor.state.doc.lines ? setCurrentLine.of(line) : setCurrentLine.of(null);
    editor.dispatch({ effects: effect });
    if (line && line > 0 && line <= editor.state.doc.lines) editor.dispatch({ selection: { anchor: editor.state.doc.line(line).from }, scrollIntoView: true });
  }, [line]);
  return <div className="editor-shell">
    <div className="editor-toolbar"><span className="editor-file">main.c <small>C subset</small></span></div>
    <div className="code-editor" ref={host} />
    <div className="editor-status"><span>Ln {position.line}, Col {position.column}</span><span id="editor-keyboard-hint">Ctrl / ⌘ + / comments · Tab leaves editor</span><button type="button" aria-expanded={helpOpen} aria-controls="editor-shortcuts" onClick={() => setHelpOpen(open => !open)}>Keyboard shortcuts</button></div>
    {helpOpen && <section className="editor-shortcuts" id="editor-shortcuts" aria-label="Editor keyboard shortcuts">
      <strong>Code comfortably</strong>
      <p>Use Ctrl on Windows/Linux, or ⌘ on Mac, for “Mod” below. Shortcuts work while the editor is focused.</p>
      <dl>{[
        ["Mod + /", "Toggle comment on selected lines"],
        ["Alt + Shift + A", "Toggle comment on selected lines"],
        ["Mod + Z / Mod + Shift + Z", "Undo / redo"],
        ["Mod + F", "Open Find and Replace"],
        ["Mod + A", "Select all code"],
        ["Mod + [ / Mod + ]", "Indent less / more"],
        ["Alt + ↑ / ↓", "Move selected lines up / down"],
        ["Enter", "New line with automatic indentation"],
        ["Tab / Shift + Tab", "Move focus to the next / previous control"],
      ].map(([keys, action]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>)}</dl>
      <p>Syntax highlighting and bracket matching help you edit; this is a supported C subset, not a full C compiler.</p>
      <button type="button" onClick={() => { setHelpOpen(false); view.current?.focus(); }}>Close guide and return to code</button>
    </section>}
  </div>;
}
