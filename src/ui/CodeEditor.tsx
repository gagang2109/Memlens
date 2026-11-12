import { useEffect, useRef } from "react";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { cpp } from "@codemirror/lang-cpp";
import { oneDark } from "@codemirror/theme-one-dark";

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
  const host = useRef<HTMLDivElement>(null); const view = useRef<EditorView>();
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({ doc: value, extensions: [cpp(), oneDark, currentLine, EditorView.lineWrapping, EditorView.updateListener.of(update => { if (update.docChanged) onChangeRef.current(update.state.doc.toString()); })] });
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
    if (line && line <= editor.state.doc.lines) editor.dispatch({ selection: { anchor: editor.state.doc.line(line).from }, scrollIntoView: true });
  }, [line]);
  return <div className="code-editor" ref={host} aria-label="C source editor" />;
}
