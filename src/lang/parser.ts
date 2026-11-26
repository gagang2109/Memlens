import { lex, type Token } from "./lexer";
import { stripComments } from "./comments";

export type Expr =
  | { kind: "literal"; value: number | string | null; line: number; literalKind?: "string" | "char" | "floating" }
  | { kind: "name"; name: string; line: number }
  | { kind: "binary"; op: string; left: Expr; right: Expr; line: number }
  | { kind: "conditional"; test: Expr; yes: Expr; no: Expr; line: number }
  | { kind: "unary"; op: string; expr: Expr; line: number; postfix?: boolean }
  | { kind: "call"; name: string; args: Expr[]; line: number }
  | { kind: "member"; object: Expr; name: string; pointer: boolean; line: number }
  | { kind: "index"; object: Expr; index: Expr; line: number }
  | { kind: "cast"; type: string; pointer: boolean; expr: Expr; line: number };
export type Stmt =
  | { kind: "block"; body: Stmt[]; line: number; declarationGroup?: true }
  | { kind: "decl"; type: string; pointer: boolean; pointerDepth?: number; name: string; init?: Expr; line: number; arrayLength?: Expr; arrayLengths?: Expr[]; arrayInitializer?: Expr[]; staticStorage?: true; readOnly?: true }
  | { kind: "expr"; expr: Expr; line: number }
  | { kind: "if"; test: Expr; yes: Stmt; no?: Stmt; line: number }
  | { kind: "while"; test: Expr; body: Stmt; line: number }
  | { kind: "for"; init?: Stmt; test?: Expr; update?: Expr; body: Stmt; line: number }
  | { kind: "do"; body: Stmt; test: Expr; line: number }
  | { kind: "switch"; test: Expr; cases: { value?: Expr; body: Stmt[]; line: number }[]; line: number }
  | { kind: "break"; line: number }
  | { kind: "continue"; line: number }
  | { kind: "return"; value?: Expr; line: number };
export type FunctionDef = { name: string; returnType: string; returnsPointer: boolean; params: { name?: string; pointer: boolean; pointerDepth?: number; array?: boolean; matrixColumns?: Expr; type: string }[]; body: Stmt; line: number };
// A null length denotes an ordinary signed-int field.
export type FixedStructField = { type: "int" | "char"; length: number | null };
export type FixedStructFields = ReadonlyMap<string, FixedStructField>;
export function fixedStructLayout(fields: FixedStructFields) {
  let bytes = 0;
  let alignment = 1;
  const members = [...fields].map(([name, field]) => {
    const stride = field.type === "char" ? 1 : 4;
    alignment = Math.max(alignment, stride);
    const offset = Math.ceil(bytes / stride) * stride;
    bytes = offset + (field.length ?? 1) * stride;
    return { ...field, name, offset, stride };
  });
  return { members, bytes: Math.ceil(bytes / alignment) * alignment };
}
export const fixedStructBytes = (fields: FixedStructFields) => fixedStructLayout(fields).bytes;
const treeChildPairs = [["lchild", "rchild"], ["llink", "rlink"]] as const;
export type TreeChildAliases = typeof treeChildPairs[number];
export type Program = { functions: Map<string, FunctionDef>; structs: Map<string, string[]>; structPointerFields: Map<string, ReadonlySet<string>>; fixedStructFields: Map<string, FixedStructFields>; aliasedTreeStructs: Map<string, TreeChildAliases>; body: Stmt[]; constants: Map<string, number | string>; floatingConstants: Set<string> };

const types = new Set(["int", "char", "long", "long", "short", "unsigned", "float", "double", "void", "struct", "const", "static"]);

function parseNumberLiteral(text: string, line: number): number {
  // A leading zero denotes an octal integer in C, not decimal padding.
  if (/^[+-]?0[0-9]+$/.test(text)) {
    if (/[89]/.test(text)) throw new Error(`line ${line}: invalid numeric literal '${text}'`);
    const sign = text.startsWith("-") ? -1 : 1;
    const digits = text.replace(/^[+-]/, "");
    const value = sign * parseInt(digits, 8);
    if (!Number.isFinite(value)) throw new Error(`line ${line}: invalid numeric literal '${text}'`);
    return value;
  }
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`line ${line}: invalid numeric literal '${text}'`);
  return value;
}

export function parse(source: string): Program {
  const constants = new Map<string, number | string>();
  const floatingConstants = new Set<string>();
  const simplePositiveBounds = new Set<string>();
  const { text, continuedLines } = stripComments(source);
  const lines = text.split(/\r?\n/);
  for (let start = 0; start < lines.length;) {
    let end = start;
    while (continuedLines.has(end)) end++;
    // A multiline block comment is whitespace within a directive, not a
    // directive terminator. The lexer still needs every physical newline.
    const directive = end === start ? lines[start] : lines.slice(start, end + 1).join(" ");
    if (directive.trimStart().startsWith("#")) {
      const define = directive.match(/^(\s*#\s*define\s+([A-Za-z_]\w*)\s+)(\S.*?)\s*$/);
      if (define) {
        const [, prefix, name, rawValue] = define;
        let valueLine = start;
        let valueOffset = prefix.length;
        while (valueLine < end && valueOffset > lines[valueLine].length) {
          valueOffset -= lines[valueLine++].length + 1;
        }
        const value = /^".*"$/.test(rawValue)
          ? rawValue.slice(1, -1)
          : Number.isNaN(Number(rawValue)) && !/^[+-]?[0-9][0-9.]*$/.test(rawValue)
            ? rawValue
            : parseNumberLiteral(rawValue, valueLine + 1);
        constants.set(name, value);
        if (/^(?:[0-9]+|0[xX][0-9a-fA-F]+)$/.test(rawValue)) simplePositiveBounds.add(name);
        else simplePositiveBounds.delete(name);
        if (typeof value === "number" && /^[+-]?(?:[0-9]+\.[0-9]*|\.[0-9]+|[0-9]+(?:\.[0-9]*)?[eE][+-]?[0-9]+)$/.test(rawValue)) floatingConstants.add(name);
        else floatingConstants.delete(name);
      }
      lines.fill("", start, end + 1);
    }
    start = end + 1;
  }
  const ts = lex(lines.join("\n")); let p = 0;
  const structs = new Map<string, string[]>(); const aliasedTreeStructs = new Map<string, TreeChildAliases>(); const structPointerFields = new Map<string, ReadonlySet<string>>(); const knownTypes = new Set(["int", "char", "long", "void"]); const aliasTypes = new Map<string, string>();
  const fixedStructFields = new Map<string, FixedStructFields>();
  const functions = new Map<string, FunctionDef>(); const body: Stmt[] = [];
  const peek = (value?: string) => value === undefined ? ts[p] : (ts[p]?.kind === "symbol" || ts[p]?.kind === "id") && ts[p]?.value === value;
  const take = (value?: string) => { const token = ts[p]; if (value && !peek(value)) throw new Error(`line ${token.line}: expected '${value}'`); p++; return token; };
  const isType = () => ts[p]?.kind === "id" && (types.has(ts[p]?.value) || knownTypes.has(ts[p]?.value) || ts[p]?.value === "typedef");
  const parseType = () => {
    const qualifier: string[] = [];
    while (["typedef", "const", "static", "unsigned", "short"].includes(ts[p]?.value)) qualifier.push(take().value);
    const first = take();
    if (first.value !== "struct") {
      if (first.value === "long" && peek("long")) take();
      if (!["int", "char", "long", "short", "float", "double", "void"].includes(first.value) && qualifier.some(value => ["short", "unsigned"].includes(value))) { p--; return qualifier.includes("short") ? "short" : "unsigned int"; }
      if (aliasTypes.has(first.value)) return aliasTypes.get(first.value)!;
      return [...qualifier.filter(value => value !== "typedef"), first.value].join(" ");
    }
    const nameToken = take(); const anonymous = nameToken.value === "{"; const name = anonymous ? "" : nameToken.value;
    if (name) knownTypes.add(name);
    if (anonymous || peek("{")) {
      if (!anonymous) take("{"); const fields: string[] = [];
      const pointerFields = new Set<string>();
      const selfPointers = new Set<string>();
      const fixedFields = new Map<string, FixedStructField>();
      let hasFixedArray = false;
      const structType = `struct${name ? ` ${name}` : ""}`;
      const field = (base: string, self: boolean) => {
        let depth = 0;
        while (peek("*")) { take(); depth++; }
        const label = take().value;
        fields.push(label);
        if (peek("[")) {
          const bracket = take("[");
          if (!name || (base !== "int" && base !== "char") || depth) throw new Error(`line ${bracket.line}: only fixed int or char arrays in named structs are supported`);
          const bound = take();
          const length = bound.kind === "number" && !/[.]/.test(bound.value)
            ? parseNumberLiteral(bound.value, bound.line)
            : bound.kind === "id" && simplePositiveBounds.has(bound.value) ? constants.get(bound.value) : undefined;
          if (typeof length !== "number" || !Number.isSafeInteger(length) || length <= 0)
            throw new Error(`line ${bound.line}: struct array member needs a positive integer literal or constant`);
          take("]");
          if (peek("[")) throw new Error(`line ${bracket.line}: multidimensional struct array members are not supported`);
          fixedFields.set(label, { type: base, length });
          hasFixedArray = true;
        } else if (base === "int" && !depth) fixedFields.set(label, { type: "int", length: null });
        if (depth) pointerFields.add(label);
        if (self && depth === 1) selfPointers.add(label);
      };
      while (!peek("}")) {
        const base = take().value;
        const self = base === "struct" ? take().value === name : aliasTypes.get(base) === structType;
        field(base, self);
        while (peek(",")) { take(); field(base, self); }
        take(";");
      }
      take("}"); structs.set(name, fields); structPointerFields.set(structType, pointerFields);
      if (hasFixedArray) {
        if (fixedFields.size !== fields.length) throw new Error(`line ${nameToken.line}: a struct with a fixed array currently needs distinct signed int fields or fixed char arrays`);
        if (fixedStructBytes(fixedFields) > 65536) throw new Error(`line ${nameToken.line}: struct exceeds simulator limit (65536 bytes)`);
        fixedStructFields.set(structType, fixedFields);
      }
      // A threaded tree can use the same pointer names for successors.
      // Leave known flag-marked layouts to a future thread-aware renderer.
      const threadMarker = fields.some(label => /^(?:[lr](?:tag|flag|bit|thread)|(?:left|right)(?:tag|flag|bit|thread)|threaded|isthreaded|thread)$/.test(label.toLowerCase().replace(/_/g, "")));
      const childPairs = treeChildPairs.filter(pair => pair.every(label => selfPointers.has(label)));
      if (name && childPairs.length === 1 && !threadMarker &&
          !fields.includes("left") && !fields.includes("right")) aliasedTreeStructs.set(structType, childPairs[0]);
      else aliasedTreeStructs.delete(structType);
    }
    return `struct${name ? ` ${name}` : ""}`;
  };
  const parseExpression = (min = 0): Expr => {
    const token = take(); let left: Expr;
    if (token.kind === "string" || token.kind === "char") left = { kind: "literal", value: token.value, line: token.line, literalKind: token.kind };
    else if (token.value === "(" && (isType())) {
      const type = parseType(); const pointer = Boolean(peek("*") && take()); take(")");
      left = { kind: "cast", type, pointer, expr: parseExpression(12), line: token.line };
    } else if (token.value === "(") { left = parseExpression(); take(")"); }
    else if (token.kind === "number") left = { kind: "literal", value: parseNumberLiteral(token.value, token.line), line: token.line,
      ...(token.value.includes(".") ? { literalKind: "floating" as const } : {}) };
    else if (token.value === "struct" || token.value === "int" || token.value === "char" || token.value === "long" || knownTypes.has(token.value)) {
      const type = token.value === "struct" ? `struct ${take().value}` : aliasTypes.get(token.value);
      const fields = type && fixedStructFields.get(type);
      left = { kind: "literal", value: fields ? fixedStructBytes(fields) : token.value === "char" ? 1 : token.value === "int" ? 4 : 16, line: token.line };
    }
    else if (token.value === "NULL") left = { kind: "literal", value: null, line: token.line };
    else if (token.value === "sizeof" && !peek("(")) left = { kind: "call", name: "sizeof", args: [parseExpression(12)], line: token.line };
    else if (["!", "-", "*", "&", "++", "--"].includes(token.value)) left = { kind: "unary", op: token.value, expr: parseExpression(12), line: token.line };
    else left = { kind: "name", name: token.value, line: token.line };
    while (p < ts.length) {
      if ((peek("++") || peek("--")) && (left.kind === "name" || left.kind === "member" || left.kind === "index" || (token.value === "(" && left.kind === "unary" && left.op === "*"))) { const op = take().value; left = { kind: "unary", op, expr: left, line: token.line, postfix: true }; continue; }
      if (peek("(") && (left.kind === "name" || left.kind === "unary")) {
        take("("); const args: Expr[] = []; while (!peek(")")) { args.push(parseExpression(1)); if (!peek(",")) break; take(","); } take(")");
        if (left.kind !== "name") throw new Error(`line ${token.line}: only named calls are supported`);
        left = { kind: "call", name: left.name, args, line: token.line }; continue;
      }
      if (peek("[")) { take("["); const index = parseExpression(); take("]"); left = { kind: "index", object: left, index, line: token.line }; continue; }
      if ((peek(".") || peek("->")) && (left.kind === "name" || left.kind === "member" || left.kind === "index" || left.kind === "unary")) { const op = take().value; const name = take(); left = { kind: "member", object: left, name: name.value, pointer: op === "->", line: name.line }; continue; }
      const op = ts[p].kind === "symbol" ? ts[p].value : ""; const precedence = ({ ",": 0, "=": 1, "+=": 1, "-=": 1, "*=": 1, "/=": 1, "%=": 1, "+": 6, "-": 6, "*": 7, "/": 7, "%": 7, "||": 2, "&&": 3, "==": 4, "!=": 4, "<": 5, ">": 5, "<=": 5, ">=": 5 } as Record<string, number>)[op] ?? -1;
      if (precedence < min) break; take(); const right = parseExpression(precedence + (["=", "+=", "-=", "*=", "/=", "%="].includes(op) ? 0 : 1)); left = { kind: "binary", op, left, right, line: token.line };
    }
    if (min <= 1 && peek("?")) {
      take(); const yes = parseExpression(); take(":"); const no = parseExpression(1);
      left = { kind: "conditional", test: left, yes, no, line: token.line };
    }
    return left;
  };
  const declaration = (): Stmt => {
    const offset = p, start = ts[p]; const isTypedef = start.value === "typedef"; const type = parseType();
    const qualifiers: string[] = [];
    for (let i = offset; ["typedef", "static", "const"].includes(ts[i]?.value); i++) qualifiers.push(ts[i].value);
    if (peek(";")) { take(";"); return { kind: "block", body: [], line: start.line }; }
    const declarations: Stmt[] = [];
    while (true) {
      let pointerDepth = 0; while (peek("*")) { take(); pointerDepth++; }
      const pointer = pointerDepth > 0; const name = take();
      const arrayLengths: Expr[] = []; const omittedDimensions: number[] = [];
      while (peek("[")) { take("["); if (!peek("]")) arrayLengths.push(parseExpression(1)); else { omittedDimensions.push(arrayLengths.length); arrayLengths.push({ kind: "literal", value: 0, line: start.line }); } take("]"); }
      let init: Expr | undefined; let arrayInitializer: Expr[] | undefined;
      if (peek("=")) { take(); if (peek("{")) { take("{"); arrayInitializer = []; while (!peek("}")) { if (peek("{")) { take(); while (!peek("}")) { arrayInitializer.push(parseExpression(1)); if (!peek(",")) break; take(","); } take("}"); } else arrayInitializer.push(parseExpression(1)); if (!peek(",")) break; take(","); } take("}"); } else init = parseExpression(1); }
      // C permits a char array string initializer with optional braces.
      // Keep character literals distinct: 'x' is not an array initializer.
      const charArray = type.includes("char") && !pointer && arrayLengths.length === 1;
      if (charArray && arrayInitializer?.length === 1 && arrayInitializer[0].kind === "literal" && arrayInitializer[0].literalKind === "string") {
        init = arrayInitializer[0]; arrayInitializer = undefined;
      }
      if (charArray && arrayInitializer?.some(value => value.kind === "literal" && value.literalKind === "string"))
        throw new Error(`line ${start.line}: unsupported char array initializer; use one string or a list of character values`);
      if (omittedDimensions.length) {
        // Preserve [] as an inferred bound, distinct from an explicit zero.
        // Only the one-dimensional initializer forms modeled by this VM are inferred.
        const inferred = arrayLengths.length === 1
          ? arrayInitializer?.length ?? (charArray && init?.kind === "literal" && init.literalKind === "string" && typeof init.value === "string" ? init.value.length + 1 : undefined)
          : undefined;
        if (inferred === undefined || inferred === 0)
          throw new Error(`line ${start.line}: unsupported omitted array bound; specify explicit positive dimensions or use a one-dimensional initializer`);
        arrayLengths[0] = { kind: "literal", value: inferred, line: start.line };
      }
      declarations.push({ kind: "decl", type, pointer, ...(pointerDepth ? { pointerDepth } : {}), name: name.value, init, arrayLength: arrayLengths[0], arrayLengths: arrayLengths.length ? arrayLengths : undefined, arrayInitializer, line: start.line,
        ...(qualifiers.includes("static") ? { staticStorage: true } : {}), ...(qualifiers.includes("const") ? { readOnly: true } : {}) });
      if (!peek(",")) break;
      take(",");
    }
    take(";");
    if (isTypedef) { const alias = declarations.at(-1); if (alias?.kind === "decl") { knownTypes.add(alias.name); aliasTypes.set(alias.name, type); } return { kind: "block", body: [], line: start.line }; }
    return declarations.length === 1 ? declarations[0] : { kind: "block", body: declarations, line: start.line, declarationGroup: true };
  };
  const statement = (): Stmt => {
    const start = ts[p];
    // A standalone semicolon is a C null statement, including an empty loop body.
    if (peek(";")) { take(); return { kind: "block", body: [], line: start.line }; }
    if (peek("{")) { take(); const statements: Stmt[] = []; while (!peek("}")) statements.push(statement()); take("}"); return { kind: "block", body: statements, line: start.line }; }
    if (peek("if")) { take(); take("("); const test = parseExpression(); take(")"); const yes = statement(); const no = peek("else") ? (take(), statement()) : undefined; return { kind: "if", test, yes, no, line: start.line }; }
    if (peek("while")) { take(); take("("); const test = parseExpression(); take(")"); return { kind: "while", test, body: statement(), line: start.line }; }
    if (peek("do")) { take(); const loopBody = statement(); take("while"); take("("); const test = parseExpression(); take(")"); take(";"); return { kind: "do", body: loopBody, test, line: start.line }; }
    if (peek("for")) { take(); take("("); const init = peek(";") ? (take(), undefined) : (isType() ? declaration() : (() => { const result = statement(); return result; })()); const test = peek(";") ? (take(), undefined) : parseExpression(); if (test) take(";"); const update = peek(")") ? undefined : parseExpression(); take(")"); return { kind: "for", init, test, update, body: statement(), line: start.line }; }
    if (peek("switch")) { take(); take("("); const test = parseExpression(); take(")"); take("{"); const cases: { value?: Expr; body: Stmt[]; line: number }[] = []; let current: { value?: Expr; body: Stmt[]; line: number } | undefined; while (!peek("}")) { if (peek("case") || peek("default")) { const isDefault = take().value === "default"; const value = isDefault ? undefined : parseExpression(); take(":"); current = { value, body: [], line: start.line }; cases.push(current); } else { if (!current) throw new Error(`line ${ts[p].line}: statement before switch case`); current.body.push(statement()); } } take("}"); return { kind: "switch", test, cases, line: start.line }; }
    if (peek("break")) { take(); take(";"); return { kind: "break", line: start.line }; }
    if (peek("continue")) { take(); take(";"); return { kind: "continue", line: start.line }; }
    if (peek("return")) { take(); const value = peek(";") ? undefined : parseExpression(); take(";"); return { kind: "return", value, line: start.line }; }
    if (isType()) return declaration();
    const value = parseExpression(); take(";"); return { kind: "expr", expr: value, line: start.line };
  };
  while (ts[p].kind !== "eof") {
    if (isType()) {
      const save = p; const type = parseType(); const pointer = Boolean(peek("*") && take()); const name = take();
      if (peek("(")) {
        take("("); const params: FunctionDef["params"] = [];
        const parameterNames = new Set<string>();
        while (!peek(")")) {
          if (peek("void") && ts[p + 1]?.value === ")") { take(); break; }
          const parameterType = isType() ? parseType() : "int";
          let parameterDepth = 0;
          while (peek("*")) { take(); parameterDepth++; }
          const parameterName = peek(",") || peek(")") || peek("[") ? undefined : take();
          if (parameterName) {
            if (parameterNames.has(parameterName.value)) {
              throw new Error(`line ${parameterName.line}: duplicate parameter '${parameterName.value}' in function '${name.value}'`);
            }
            parameterNames.add(parameterName.value);
          }
          const array = Boolean(peek("["));
          if (array) { take("["); if (!peek("]")) parseExpression(); take("]"); }
          let matrixColumns: Expr | undefined;
          if (array && peek("[")) {
            take("[");
            if (parameterDepth || peek("]")) throw new Error(`line ${name.line}: matrix parameters need a fixed column count and a scalar element type`);
            matrixColumns = parseExpression();
            take("]");
            if (peek("[")) throw new Error(`line ${name.line}: only two-dimensional matrix parameters are supported`);
          }
          const pointerDepth = parameterDepth + (array ? 1 : 0);
          params.push({ name: parameterName?.value, pointer: pointerDepth > 0, ...(pointerDepth ? { pointerDepth } : {}), array, ...(matrixColumns ? { matrixColumns } : {}), type: parameterType });
          if (!peek(",")) break;
          take(",");
        }
        take(")");
        if (peek(";")) { take(); continue; }
        if (functions.has(name.value)) throw new Error(`line ${name.line}: duplicate definition of function '${name.value}'`);
        functions.set(name.value, { name: name.value, returnType: type, returnsPointer: pointer, params, body: statement(), line: name.line });
      } else { p = save; body.push(statement()); }
    } else if (peek(";")) take(";"); else body.push(statement());
  }
  return { functions, structs, structPointerFields, fixedStructFields, aliasedTreeStructs, body, constants, floatingConstants };
}
