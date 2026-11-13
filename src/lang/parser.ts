import { lex, type Token } from "./lexer";

export type Expr =
  | { kind: "literal"; value: number | string | null; line: number }
  | { kind: "name"; name: string; line: number }
  | { kind: "binary"; op: string; left: Expr; right: Expr; line: number }
  | { kind: "conditional"; test: Expr; yes: Expr; no: Expr; line: number }
  | { kind: "unary"; op: string; expr: Expr; line: number; postfix?: boolean }
  | { kind: "call"; name: string; args: Expr[]; line: number }
  | { kind: "member"; object: Expr; name: string; pointer: boolean; line: number }
  | { kind: "index"; object: Expr; index: Expr; line: number }
  | { kind: "cast"; type: string; pointer: boolean; expr: Expr; line: number };
export type Stmt =
  | { kind: "block"; body: Stmt[]; line: number }
  | { kind: "decl"; type: string; pointer: boolean; name: string; init?: Expr; line: number; arrayLength?: Expr; arrayLengths?: Expr[]; arrayInitializer?: Expr[] }
  | { kind: "expr"; expr: Expr; line: number }
  | { kind: "if"; test: Expr; yes: Stmt; no?: Stmt; line: number }
  | { kind: "while"; test: Expr; body: Stmt; line: number }
  | { kind: "for"; init?: Stmt; test?: Expr; update?: Expr; body: Stmt; line: number }
  | { kind: "do"; body: Stmt; test: Expr; line: number }
  | { kind: "switch"; test: Expr; cases: { value?: Expr; body: Stmt[]; line: number }[]; line: number }
  | { kind: "break"; line: number }
  | { kind: "continue"; line: number }
  | { kind: "return"; value?: Expr; line: number };
export type FunctionDef = { name: string; params: { name: string; pointer: boolean; array?: boolean; type: string }[]; body: Stmt; line: number };
export type Program = { functions: Map<string, FunctionDef>; structs: Map<string, string[]>; body: Stmt[]; constants: Map<string, number | string> };

const types = new Set(["int", "char", "long", "long", "short", "unsigned", "float", "double", "void", "struct", "const", "static"]);

export function parse(source: string): Program {
  const constants = new Map<string, number | string>();
  const lines = source.split(/\r?\n/).map(line => {
    const define = line.match(/^\s*#define\s+([A-Za-z_]\w*)\s+(.+?)\s*$/);
    if (define) { const value = /^".*"$/.test(define[2]) ? define[2].slice(1, -1) : Number.isNaN(Number(define[2])) ? define[2] : Number(define[2]); constants.set(define[1], value); }
    return line.trimStart().startsWith("#") ? "" : line;
  });
  const ts = lex(lines.join("\n")); let p = 0;
  const structs = new Map<string, string[]>(); const knownTypes = new Set(["int", "char", "long", "void"]); const aliasTypes = new Map<string, string>();
  const functions = new Map<string, FunctionDef>(); const body: Stmt[] = [];
  const peek = (value?: string) => value === undefined ? ts[p] : ts[p]?.value === value;
  const take = (value?: string) => { const token = ts[p]; if (value && token.value !== value) throw new Error(`line ${token.line}: expected '${value}'`); p++; return token; };
  const isType = () => types.has(ts[p]?.value) || knownTypes.has(ts[p]?.value) || ts[p]?.value === "typedef";
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
      while (!peek("}")) {
        if (peek("struct")) { take(); take(); } else take();
        while (peek("*")) take();
        fields.push(take().value);
        while (peek(",")) { take(); while (peek("*")) take(); fields.push(take().value); }
        take(";");
      }
      take("}"); structs.set(name, fields);
    }
    return `struct${name ? ` ${name}` : ""}`;
  };
  const parseExpression = (min = 0): Expr => {
    const token = take(); let left: Expr;
    if (token.value === "(" && (isType())) {
      const type = parseType(); const pointer = Boolean(peek("*") && take()); take(")");
      left = { kind: "cast", type, pointer, expr: parseExpression(12), line: token.line };
    } else if (token.value === "(") { left = parseExpression(); take(")"); }
    else if (token.kind === "number") left = { kind: "literal", value: Number(token.value), line: token.line };
    else if (token.value === "struct" || token.value === "int" || token.value === "char" || token.value === "long" || knownTypes.has(token.value)) { if (token.value === "struct") take(); left = { kind: "literal", value: token.value === "char" ? 1 : token.value === "int" ? 4 : 16, line: token.line }; }
    else if (token.kind === "string" || token.kind === "char") left = { kind: "literal", value: token.value, line: token.line };
    else if (token.value === "NULL") left = { kind: "literal", value: null, line: token.line };
    else if (token.value === "sizeof" && !peek("(")) left = { kind: "call", name: "sizeof", args: [parseExpression(12)], line: token.line };
    else if (["!", "-", "*", "&", "++", "--"].includes(token.value)) left = { kind: "unary", op: token.value, expr: parseExpression(12), line: token.line };
    else left = { kind: "name", name: token.value, line: token.line };
    while (p < ts.length) {
      if ((peek("++") || peek("--")) && (left.kind === "name" || left.kind === "member" || left.kind === "index")) { const op = take().value; left = { kind: "unary", op, expr: left, line: token.line, postfix: true }; continue; }
      if (peek("(") && (left.kind === "name" || left.kind === "unary")) {
        take("("); const args: Expr[] = []; while (!peek(")")) { args.push(parseExpression(1)); if (!peek(",")) break; take(","); } take(")");
        if (left.kind !== "name") throw new Error(`line ${token.line}: only named calls are supported`);
        left = { kind: "call", name: left.name, args, line: token.line }; continue;
      }
      if (peek("[")) { take("["); const index = parseExpression(); take("]"); left = { kind: "index", object: left, index, line: token.line }; continue; }
      if ((peek(".") || peek("->")) && (left.kind === "name" || left.kind === "member" || left.kind === "index" || left.kind === "unary")) { const op = take().value; const name = take(); left = { kind: "member", object: left, name: name.value, pointer: op === "->", line: name.line }; continue; }
      const op = ts[p].value; const precedence = ({ ",": 0, "=": 1, "+=": 1, "-=": 1, "+": 6, "-": 6, "*": 7, "/": 7, "%": 7, "||": 2, "&&": 3, "==": 4, "!=": 4, "<": 5, ">": 5, "<=": 5, ">=": 5 } as Record<string, number>)[op] ?? -1;
      if (precedence < min) break; take(); const right = parseExpression(precedence + (["=", "+=", "-="].includes(op) ? 0 : 1)); left = { kind: "binary", op, left, right, line: token.line };
    }
    if (min <= 1 && peek("?")) {
      take(); const yes = parseExpression(); take(":"); const no = parseExpression(1);
      left = { kind: "conditional", test: left, yes, no, line: token.line };
    }
    return left;
  };
  const declaration = (): Stmt => {
    const start = ts[p]; const isTypedef = start.value === "typedef"; const type = parseType();
    if (peek(";")) { take(";"); return { kind: "block", body: [], line: start.line }; }
    const declarations: Stmt[] = [];
    while (true) {
      let pointer = false; while (peek("*")) { take(); pointer = true; } const name = take();
      const arrayLengths: Expr[] = [];
      while (peek("[")) { take("["); if (!peek("]")) arrayLengths.push(parseExpression(1)); else arrayLengths.push({ kind: "literal", value: 0, line: start.line }); take("]"); }
      let init: Expr | undefined; let arrayInitializer: Expr[] | undefined;
      if (peek("=")) { take(); if (peek("{")) { take("{"); arrayInitializer = []; while (!peek("}")) { if (peek("{")) { take(); while (!peek("}")) { arrayInitializer.push(parseExpression(1)); if (!peek(",")) break; take(","); } take("}"); } else arrayInitializer.push(parseExpression(1)); if (!peek(",")) break; take(","); } take("}"); } else init = parseExpression(1); }
      declarations.push({ kind: "decl", type, pointer, name: name.value, init, arrayLength: arrayLengths[0], arrayLengths: arrayLengths.length ? arrayLengths : undefined, arrayInitializer, line: start.line });
      if (!peek(",")) break;
      take(",");
    }
    take(";");
    if (isTypedef) { const alias = declarations.at(-1); if (alias?.kind === "decl") { knownTypes.add(alias.name); aliasTypes.set(alias.name, type); } return { kind: "block", body: [], line: start.line }; }
    return declarations.length === 1 ? declarations[0] : { kind: "block", body: declarations, line: start.line };
  };
  const statement = (): Stmt => {
    const start = ts[p];
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
        while (!peek(")")) {
          if (peek("void") && ts[p + 1]?.value === ")") { take(); break; }
          const parameterType = isType() ? parseType() : "int"; let parameterPointer = false; while (peek("*")) { take(); parameterPointer = true; } const parameterName = (peek(",") || peek(")") || peek("[") ? { value: `arg${params.length}` } : take()); const array = Boolean(peek("[")); if (array) { take("["); if (!peek("]")) parseExpression(); take("]"); } params.push({ name: parameterName.value, pointer: parameterPointer || array, array, type: parameterType }); if (!peek(",")) break; take(",");
        }
        take(")");
        if (peek(";")) { take(); continue; }
        functions.set(name.value, { name: name.value, params, body: statement(), line: name.line });
      } else { p = save; body.push(statement()); }
    } else if (peek(";")) take(";"); else body.push(statement());
  }
  return { functions, structs, body, constants };
}
