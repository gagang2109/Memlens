/** Keep playback shortcuts out of editors and native interactive controls. */
export function shouldHandlePlaybackShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
  const target = event.target;
  if (!(target instanceof Element)) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return false;
  if (target.closest('button[data-step-navigation="true"]') && ["ArrowLeft", "ArrowRight"].includes(event.key)) return true;
  return !target.closest('input, textarea, select, button, summary, a[href], [role="button"], [role="textbox"], [role="menu"], [role="listbox"], [role="combobox"], dialog, [role="dialog"], [role="alertdialog"], [data-run-shortcut="ignore"], [contenteditable]:not([contenteditable="false"])');
}

/** Run throughout the workspace, while menus and dialogs keep their keys.
 * CodeMirror handles both run bindings when the source editor is focused. */
export function workspaceRunShortcut(event: KeyboardEvent): "run" | "run-and-play" | undefined {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.key !== "Enter") return;
  const mod = event.ctrlKey || event.metaKey;
  if (mod === event.shiftKey) return;
  const action = mod ? "run" : "run-and-play";
  const target = event.target;
  if (!(target instanceof Element)) return action;
  if (target instanceof HTMLElement && target.isContentEditable) return;
  if (target.closest('[role="menu"], [role="listbox"], [role="combobox"], dialog, [role="dialog"], [role="alertdialog"], [data-run-shortcut="ignore"], [contenteditable]:not([contenteditable="false"])')) return;
  // Shift+Enter alone may have a native editing or selection meaning.
  if (action === "run-and-play" && target.closest('input, textarea, select, [role="textbox"], [role="searchbox"]')) return;
  return action;
}

/** Use the typed character, so the shortcut works across keyboard layouts. */
export function shouldOpenWorkspaceHelp(event: KeyboardEvent): boolean {
  if (event.key !== "?" || event.defaultPrevented || event.isComposing || event.repeat ||
      event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof Element)) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return false;
  return !target.closest('input, textarea, select, [role="textbox"], [role="searchbox"], [role="combobox"], [role="listbox"], [role="menu"], dialog, [role="dialog"], [role="alertdialog"], [contenteditable]:not([contenteditable="false"])');
}
