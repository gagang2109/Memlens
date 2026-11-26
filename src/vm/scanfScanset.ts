/** Read a scanf bracket set following its opening '['. */
export function parseScanset(format: string, start: number) {
  const negated = format[start] === "^";
  const first = start + Number(negated);
  // A ']' immediately after '[' or '[^' is itself part of the set.
  const end = format.indexOf("]", first + Number(format[first] === "]"));
  if (end <= first) return undefined;
  const characters = new Set<string>();
  const ranges: [number, number][] = [];
  for (let i = first; i < end; i++) {
    if (format[i + 1] === "-" && i + 2 < end) {
      const lo = format.charCodeAt(i), hi = format.charCodeAt(i + 2);
      // C leaves interior '-' implementation-defined. Model common ascending
      // ranges and reject descending ones rather than silently changing sets.
      if (hi < lo) return undefined;
      ranges.push([lo, hi]);
      i += 2;
    } else characters.add(format[i]);
  }
  return { end, includes(character: string) {
    const code = character.charCodeAt(0);
    const matches = characters.has(character) || ranges.some(([lo, hi]) => lo <= code && code <= hi);
    return negated !== matches;
  }};
}
