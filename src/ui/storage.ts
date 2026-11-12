// Saved preferences are optional: browser privacy settings or quota limits
// must never prevent a program from running.
export function readSavedCount(key: string): number {
  try {
    const value = Number(localStorage.getItem(key) ?? 0);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}

export function saveCount(key: string, value: number): void {
  try { localStorage.setItem(key, String(value)); } catch { /* storage is optional */ }
}
