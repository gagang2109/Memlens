/** Keep playback shortcuts out of editors and native interactive controls. */
export function shouldHandlePlaybackShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof Element)) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return false;
  if (target.closest('button[data-step-navigation="true"]') && ["ArrowLeft", "ArrowRight"].includes(event.key)) return true;
  return !target.closest('input, textarea, select, button, a[href], [role="button"], [role="textbox"], [role="menu"], [role="listbox"], [role="combobox"], dialog, [role="dialog"], [role="alertdialog"], [data-run-shortcut="ignore"], [contenteditable]:not([contenteditable="false"])');
}

/** Run throughout the workspace, while menus/dialogs keep their keys.
 * CodeMirror has its own explicit run binding and prevents duplicate handling. */
export function shouldHandleRunShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.shiftKey || event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return false;
  const target = event.target;
  if (!(target instanceof Element)) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return false;
  return !target.closest('select, [role="menu"], [role="listbox"], [role="combobox"], dialog, [role="dialog"], [role="alertdialog"], [data-run-shortcut="ignore"], [contenteditable]:not([contenteditable="false"])');
}
