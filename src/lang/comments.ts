/** Replace comments with whitespace before processing directives, preserving source lines. */
export function stripComments(source: string): string {
  const out = source.split('');
  let quote: string | undefined;
  let line = 1;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\n') line++;
    if (quote) {
      if (ch === '\\' && i + 1 < source.length) { if (source[i + 1] === '\n') line++; i++; }
      else if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (source.slice(i, i + 2) === '//') {
      while (i < source.length && source[i] !== '\n') out[i++] = ' ';
      i--; continue;
    }
    if (source.slice(i, i + 2) === '/*') {
      const openingLine = line;
      out[i++] = ' '; out[i++] = ' ';
      while (i < source.length && source.slice(i, i + 2) !== '*/') {
        if (source[i] === '\n') line++; else out[i] = ' ';
        i++;
      }
      if (i >= source.length) throw new Error(`line ${openingLine}: unterminated block comment`);
      out[i] = ' '; out[++i] = ' ';
    }
  }
  return out.join('');
}
