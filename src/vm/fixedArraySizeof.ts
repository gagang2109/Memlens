import type { Expr, Program } from "../lang/parser";

type BoundsContext = Pick<Program, "constants" | "floatingConstants"> & { lookup: (name: string) => ArrayVariable | undefined };
type ArrayVariable = { type: string; pointer: boolean; pointerDepth?: number; array?: readonly unknown[]; dimensions?: number[]; fixedArrayBounds?: boolean; elementSize?: number };
type Context = BoundsContext & Pick<Program, "functions">;

const arithmetic = new Set(["+", "-", "*", "/", "%"]);
const comparison = new Set(["<", "<=", ">", ">=", "==", "!="]);
const logical = new Set(["&&", "||"]);
const assignment = new Set(["=", "+=", "-=", "*=", "/=", "%="]);

function numericConstant(name: string, context: BoundsContext) {
  return name === "EOF" || typeof context.constants.get(name) === "number" && !context.floatingConstants.has(name);
}

// Classify before the declaration's existing dimension evaluation. A
// runtime variable that currently equals 3 is not the same as a fixed 3.
export function isFixedArrayBound(expr: Expr, context: BoundsContext): boolean {
  if (expr.kind === "literal") return expr.literalKind === "char" ||
    (typeof expr.value === "number" && expr.literalKind !== "floating" && Number.isSafeInteger(expr.value));
  if (expr.kind === "name") return !context.lookup(expr.name) && numericConstant(expr.name, context);
  if (expr.kind === "unary") return ["!", "-"].includes(expr.op) && isFixedArrayBound(expr.expr, context);
  if (expr.kind === "conditional") return [expr.test, expr.yes, expr.no].every(item => isFixedArrayBound(item, context));
  if (expr.kind === "binary") return (arithmetic.has(expr.op) || comparison.has(expr.op) || logical.has(expr.op))
    && isFixedArrayBound(expr.left, context) && isFixedArrayBound(expr.right, context);
  return false;
}

type ValueType = { base: "integer" | "floating" | "other"; pointers: number; rank: number; readOnly?: boolean };
const scalar = (base: ValueType["base"]): ValueType => ({ base, pointers: 0, rank: 0 });
const integer = scalar("integer");
const normalized = (type: string) => type.split(/\s+/).filter(part => part !== "const" && part !== "static").join(" ");
const baseType = (type: string): ValueType["base"] => {
  const name = normalized(type);
  if (/^(?:(?:unsigned|signed) )?(?:char|short|short int|int|long|long int|long long|long long int)$/.test(name)) return "integer";
  return ["float", "double"].includes(name) ? "floating" : "other";
};
const isNumeric = (type: ValueType) => !type.pointers && !type.rank && type.base !== "other";
const isIntegral = (type: ValueType | undefined) => type?.base === "integer" && !type.pointers && !type.rank;
const isScalar = (type: ValueType) => !type.rank && (type.pointers > 0 || type.base !== "other");
const pointedType = (type: ValueType) => type.rank ? { ...type, rank: type.rank - 1 }
  : type.pointers ? { ...type, pointers: type.pointers - 1 } : undefined;
const numericResult = (a: ValueType, b: ValueType) => a.base === "floating" || b.base === "floating" ? scalar("floating") : integer;
const lvalue = (expr: Expr) => expr.kind === "name" || expr.kind === "index" || (expr.kind === "unary" && expr.op === "*");

function indexType(expr: Expr, context: Context): ValueType | undefined {
  if (expr.kind === "literal") {
    if (expr.literalKind === "string") return { base: "integer", pointers: 0, rank: 1 };
    if (expr.literalKind === "char") return integer;
    if (expr.literalKind === "floating") return scalar("floating");
    if (typeof expr.value === "number") return integer;
    if (expr.value === null) return { base: "other", pointers: 1, rank: 0 };
    return;
  }
  if (expr.kind === "name") {
    const variable = context.lookup(expr.name);
    if (variable) return {
      base: baseType(variable.type),
      pointers: variable.pointerDepth ?? (variable.pointer ? 1 : 0),
      rank: variable.dimensions?.length ?? 0,
      readOnly: variable.type.split(/\s+/).includes("const"),
    };
    if (numericConstant(expr.name, context)) return integer;
    if (context.floatingConstants.has(expr.name)) return scalar("floating");
    return;
  }
  if (expr.kind === "index") {
    const object = indexType(expr.object, context);
    if (!object || !isIntegral(indexType(expr.index, context))) return;
    return pointedType(object);
  }
  if (expr.kind === "unary") {
    const type = indexType(expr.expr, context);
    if (!type) return;
    if (expr.op === "*") return pointedType(type);
    if (expr.op === "&" && lvalue(expr.expr) && !type.rank) return { ...type, pointers: type.pointers + 1 };
    if (expr.op === "!" && isScalar(type)) return integer;
    if (expr.op === "-" && isNumeric(type)) return type;
    if (["++", "--"].includes(expr.op) && lvalue(expr.expr) && isScalar(type) && !type.readOnly) return type;
    return;
  }
  if (expr.kind === "cast") {
    const type = indexType(expr.expr, context);
    if (!type || !isScalar(type) || expr.pointer || baseType(expr.type) === "other") return;
    return scalar(baseType(expr.type));
  }
  if (expr.kind === "conditional") {
    const condition = indexType(expr.test, context);
    const a = indexType(expr.yes, context);
    const b = indexType(expr.no, context);
    if (condition && isScalar(condition) && a && b && isNumeric(a) && isNumeric(b)) return numericResult(a, b);
    return;
  }
  if (expr.kind === "binary") {
    const a = indexType(expr.left, context), b = indexType(expr.right, context);
    if (!a || !b) return;
    // Both operands must be known even when only the right type is returned.
    if (expr.op === ",") return b;
    if (logical.has(expr.op) && isScalar(a) && isScalar(b)) return integer;
    if (!isNumeric(a) || !isNumeric(b)) return;
    if (comparison.has(expr.op)) return integer;
    if (expr.op === "%" || expr.op === "%=") {
      if (!isIntegral(a) || !isIntegral(b)) return;
    }
    if (arithmetic.has(expr.op)) return numericResult(a, b);
    if (assignment.has(expr.op) && lvalue(expr.left) && !a.readOnly) return a;
    return;
  }
  if (expr.kind === "call") {
    if (expr.name === "getchar" && !expr.args.length) return integer;
    const fn = context.functions.get(expr.name);
    if (!fn || expr.args.length !== fn.params.length) return;
    for (const [index, argument] of expr.args.entries()) {
      const actual = indexType(argument, context);
      const parameter = fn.params[index];
      if (!actual) return;
      if (parameter.pointer) {
        const depth = parameter.pointerDepth ?? 1;
        if (actual.rank > 1 || actual.pointers + Number(actual.rank === 1) !== depth || actual.base !== baseType(parameter.type)) return;
      } else if (baseType(parameter.type) === "other" || !isNumeric(actual)) return;
    }
    return { base: baseType(fn.returnType), pointers: fn.returnsPointer ? 1 : 0, rank: 0 };
  }
}

export function localArraySizeof(expr: Expr | undefined, context: Context, fail: (reason: string, line: number) => never): number | undefined {
  const levels: Array<{ line: number; index?: Expr }> = [];
  let root = expr;
  while (root?.kind === "index" || (root?.kind === "unary" && root.op === "*")) {
    if (root.kind === "index") {
      levels.push({ line: root.line, index: root.index });
      root = root.object;
    } else {
      levels.push({ line: root.line });
      root = root.expr;
    }
  }
  if (root?.kind !== "name") return;
  const array = context.lookup(root.name);
  if (!array?.array || !array.dimensions || array.pointerDepth || !["int", "char"].includes(normalized(array.type))) return;
  // A named array already has its evaluated bounds. Indexed operands
  // that yield a variable-length row have separate C evaluation rules.
  if (!array.fixedArrayBounds && levels.length) fail("sizeof indexed or dereferenced variable-length arrays is not supported", root.line);
  if (levels.length > array.dimensions.length) fail("too many subscripts or dereferences in sizeof array operand", levels[0].line);
  for (const { index } of levels.reverse())
    if (index && !isIntegral(indexType(index, context))) fail("sizeof array index requires a supported integer expression", index.line);
  return array.dimensions.slice(levels.length).reduce((size, bound) => size * bound, array.elementSize!);
}
