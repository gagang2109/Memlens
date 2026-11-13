export type TokenKind = "id" | "number" | "string" | "char" | "symbol" | "eof";
export type Token = { kind: TokenKind; value: string; line: number; column: number };

const two = new Set(["==", "!=", "<=", ">=", "++", "--", "->", "&&", "||", "+=", "-=", "*=", "/="]);
export function lex(source: string): Token[] {
  const out: Token[] = []; let i = 0; let line = 1; let column = 1;
  const push = (kind: TokenKind, value: string, l: number, c: number) => out.push({ kind, value, line: l, column: c });
  while (i < source.length) {
    const ch = source[i]; if (ch === " " || ch === "\t" || ch === "\r") { i++; column++; continue; }
    if (ch === "\n") { i++; line++; column = 1; continue; }
    if (source.slice(i, i + 2) === "//") { while (i < source.length && source[i] !== "\n") { i++; column++; } continue; }
    if (source.slice(i, i + 2) === "/*") { i += 2; column += 2; while (i < source.length && source.slice(i, i + 2) !== "*/") { if (source[i] === "\n") { line++; column = 1; } else column++; i++; } i += 2; column += 2; continue; }
    const l = line, c = column;
    if (/[A-Za-z_]/.test(ch)) { let v = ch; i++; column++; while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) { v += source[i++]; column++; } push("id", v, l, c); continue; }
    if (/[0-9]/.test(ch)) { let v = ch; i++; column++; while (i < source.length && /[0-9.]/.test(source[i])) { v += source[i++]; column++; } push("number", v, l, c); continue; }
    if (ch === '"' || ch === "'") {
      const quote = ch; let v = ""; i++; column++;
      const escapes: Record<string, string> = { "0": "\0", n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", a: "\x07", "?": "?", "\\": "\\", '"': '"', "'": "'" };
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\n" || source[i] === "\r") throw new Error(`line ${l}: unterminated ${quote === '"' ? "string" : "character"} literal`);
        if (source[i] !== "\\") { v += source[i++]; column++; continue; }
        i++; column++;
        if (i >= source.length) break;
        const escape = source[i++]; column++;
        if (/[0-7]/.test(escape)) {
          let digits = escape;
          while (digits.length < 3 && i < source.length && /[0-7]/.test(source[i])) { digits += source[i++]; column++; }
          const value = parseInt(digits, 8);
          if (value > 255) throw new Error(`line ${l}: escape value outside supported byte range`);
          v += String.fromCharCode(value);
        } else if (escape === "x") {
          let digits = "";
          while (i < source.length && /[0-9a-fA-F]/.test(source[i])) { digits += source[i++]; column++; }
          if (!digits || parseInt(digits, 16) > 255) throw new Error(`line ${l}: invalid or unsupported hexadecimal escape`);
          v += String.fromCharCode(parseInt(digits, 16));
        } else {
          if (!(escape in escapes)) throw new Error(`line ${l}: unsupported escape sequence`);
          v += escapes[escape];
        }
      }
      if (i >= source.length) throw new Error(`line ${l}: unterminated ${quote === '"' ? "string" : "character"} literal`);
      i++; column++;
      if (quote === "'" && v.length !== 1) throw new Error(`line ${l}: expected a single character literal`);
      push(quote === '"' ? "string" : "char", v, l, c); continue;
    }
    const pair = source.slice(i, i + 2); if (two.has(pair)) { push("symbol", pair, l, c); i += 2; column += 2; continue; }
    push("symbol", ch, l, c); i++; column++;
  }
  out.push({ kind: "eof", value: "", line, column }); return out;
}
