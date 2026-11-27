import { InvalidC } from "./diagnostics";

export type CommentScan = {
  text: string;
  // Zero-based physical line indices whose newline is inside a block comment.
  continuedLines: ReadonlySet<number>;
};

/** Blank comments without changing code offsets or removing physical newlines. */
export function stripComments(source: string): CommentScan {
  const out = source.split("");
  const continuedLines = new Set<number>();
  let quote: string | undefined;
  let line = 0;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\n") {
      line++;
      // The supported literals and directives do not span a bare newline.
      quote = undefined;
    }
    if (quote) {
      if (ch === "\\" && i + 1 < source.length && source[i + 1] !== "\n") i++;
      else if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (source.startsWith("//", i)) {
      while (i < source.length && source[i] !== "\n") out[i++] = " ";
      i--;
      continue;
    }
    if (source.startsWith("/*", i)) {
      const openingLine = line + 1;
      out[i++] = " ";
      out[i++] = " ";
      while (i < source.length && !source.startsWith("*/", i)) {
        if (source[i] === "\n") continuedLines.add(line++);
        else out[i] = " ";
        i++;
      }
      if (i >= source.length) throw new InvalidC(openingLine, "unterminated block comment");
      out[i] = " ";
      out[++i] = " ";
    }
  }

  return { text: out.join(""), continuedLines };
}
