const playbackControls = 'input, textarea, select, button, summary, a[href], [role="button"], [role="textbox"], [role="searchbox"], [role="menu"], [role="listbox"], [role="combobox"], dialog, [role="dialog"], [role="alertdialog"], [data-run-shortcut="ignore"], [contenteditable]:not([contenteditable="false"])';

function hasPlaybackConflict(event: KeyboardEvent): boolean {
  return event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey;
}

function isEditable(target: Element): boolean {
  return target instanceof HTMLElement && target.isContentEditable;
}

/** Keep playback shortcuts out of editors and native interactive controls. */
export function shouldHandlePlaybackShortcut(event: KeyboardEvent): boolean {
  if (hasPlaybackConflict(event) || event.shiftKey) return false;
  const target = event.target;
  if (!(target instanceof Element)) return true;
  if (isEditable(target)) return false;
  if (target.closest('button[data-step-navigation="true"]') && ["ArrowLeft", "ArrowRight"].includes(event.key)) return true;
  return !target.closest(playbackControls);
}

export const playbackSpeeds = [0.5, 1, 2, 4] as const;
type PlaybackSpeed = typeof playbackSpeeds[number];
type SpeedDirection = -1 | 0 | 1;

/** Identify typed speed keys (including Shift+= and numpad +/-) without claiming browser zoom. */
export function playbackSpeedShortcut(event: KeyboardEvent): SpeedDirection | undefined {
  if (hasPlaybackConflict(event) || event.repeat || (event.shiftKey && event.key !== "+")) return;
  const direction = event.key === "-" ? -1 : event.key === "=" ? 0 : event.key === "+" ? 1 : undefined;
  if (direction === undefined) return;
  const target = event.target;
  if (!(target instanceof Element)) return direction;
  if (isEditable(target) || target.closest('[role="menu"], [role="listbox"], [role="combobox"], dialog, [role="dialog"], [role="alertdialog"], [data-run-shortcut="ignore"], .diagram-viewport')) return;
  if (target.closest('button[data-playback-speed-keys]')) return direction;
  if (target.closest(playbackControls + ', [role="slider"], [role="separator"]')) return;
  return direction;
}

/** Move one stop, clamping to the available speeds. Zero resets to 1×. */
export function stepPlaybackSpeed(current: number, direction: SpeedDirection): PlaybackSpeed {
  if (direction === 0) return 1;
  const index = playbackSpeeds.findIndex(speed => speed === current);
  const next = (index < 0 ? 1 : index) + direction;
  return playbackSpeeds[Math.max(0, Math.min(next, playbackSpeeds.length - 1))];
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
