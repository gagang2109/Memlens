/** Keep playback shortcuts out of editors and native interactive controls. */
export function shouldHandlePlaybackShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof Element)) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return false;
  return !target.closest('input, textarea, select, button, a[href], [role="button"], [role="textbox"], [contenteditable]:not([contenteditable="false"])');
}
