import { SIM_POINTER_BYTES, fixedStructBytes, fixedStructLayout, parse, type Expr, type FunctionDef, type Program, type Stmt } from "../lang/parser";
import { Memory, MemoryFault, type Allocation } from "./memory";
import { Trace, type ArraySnapshot, type FrameVariable, type FrameView } from "./trace";
import { parseScanset } from "./scanfScanset";
import { localArraySizeof, isFixedArrayBound, pointerOperandSizeof } from "./fixedArraySizeof";

type Value = number | string | null;
type LocalArrayOwner = { vars: Map<string, RuntimeVariable>; name: string; variable: RuntimeVariable };
type LocalArray = { values: Value[]; type: string; dimensions: number[];
  owner?: LocalArrayOwner; scanBufferOwner?: LocalArrayOwner };
type RuntimeVariable = { value: Value; type: string; pointer: boolean; pointerDepth?: number; array?: Value[]; dimensions?: number[]; fixedArrayBounds?: boolean; matrixColumnCount?: number; elementSize?: number; arrayBase?: number; address?: number };
type Ref = { get: () => Value; set: (value: Value) => void; address?: number; allocation?: Allocation };
type HeapObject = { address: number; fields: Map<string, Value>; type?: string };
type FixedMember = { name: string; type: "char" | "int"; stride: number; address: number; invocation: number; values?: Value[]; scalar: Value };
type FixedLocalStruct = { address: number; invocation: number; members: Map<string, FixedMember> };
type FlowSignal = "break" | "continue";

export type RunResult = { executionMode?: "program" | "snippet"; trace: Trace; status: "ok" | "error" | "waiting"; waitingLine?: number; error?: MemoryFault; leaks: { address: number; line: number }[]; orphanedAtExit: number[] };

const elementSize = (type: string) => type.includes("char") ? 1 : type.startsWith("struct") ? 16 : 4;
const builtinArgumentCounts = new Map<string, number>([
  ["malloc", 1], ["calloc", 2], ["realloc", 2], ["free", 1],
  ["strlen", 1], ["strcpy", 2], ["strcat", 2], ["strcmp", 2],
  ["memset", 3], ["getchar", 0], ["exit", 1],
]);

export function run(source: string, stepLimit = 100000, recursionLimit = 100, stdin = "", inputOpen = false): RunResult {
  const trace = new Trace();
  let program: Program;
  try { program = parse(source); } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unsupported construct";
    const match = message.match(/line (\d+)/); const line = match ? Number(match[1]) : 1;
    const error = new MemoryFault(`parse error: ${message}`, line, 0, undefined, true, "parse");
    trace.add({ line, stdout: "", memory: { bytes: [], shadows: [], allocations: [] }, frames: [], event: "error", message: error.reason });
    return { trace, status: "error", error, leaks: [], orphanedAtExit: [] };
  }
  const memory = new Memory(); const heap = new Map<number, HeapObject>(); const cells = new Map<number, Value>();
  const arrayRefs = new Map<number, LocalArray>(); const locations = new Map<number, Ref>();
  // Local storage uses virtual addresses outside both the simulated heap and
  // the separate bounded struct storage. Numeric equality must not alias them.
  let nextStackAddress = 0x200000;
  const frames: { invocation: number; name: string; vars: Map<string, RuntimeVariable> }[] = [{ invocation: 0, name: "main", vars: new Map() }];
  const fixedObjects = new Map<number, FixedLocalStruct>();
  const fixedArrays = new Map<number, FixedMember>();
  const fixedAddressStart = 0x100000;
  const fixedStorageBytes = 262144;
  const inFixedStorage = (address: number) => address >= fixedAddressStart && address < fixedAddressStart + fixedStorageBytes;
  let nextFixedAddress = fixedAddressStart;
  let nextInvocation = 1;
  let previousArrays = new Map<number, ArraySnapshot>();
  let stdout = ""; let stdinCursor = 0; let steps = 0; let error: MemoryFault | undefined;
  const current = () => frames[frames.length - 1].vars;
  // Character values use one-character strings in the existing VM representation.
  // Promote these to basic execution-character codes, including digits and NUL.
  const asNum = (value: Value) => typeof value === "number" ? value : value === null ? 0 : value.length === 1 ? value.charCodeAt(0) : Number(value);
  const findVariable = (name: string) => [...frames].reverse().map(frame => frame.vars.get(name)).find(Boolean);
  const sizeofContext = { constants: program.constants, floatingConstants: program.floatingConstants, functions: program.functions, lookup: findVariable };
  const pointerMeta = (expression: Expr) => expression.kind === "name" ? findVariable(expression.name) : undefined;
  const record = (line: number, event: "step" | "alloc" | "free" | "error" | "call" | "return" = "step", message?: string) => {
    const arrays = new Map<number, ArraySnapshot>();
    const captureArray = (base: number, dimensions: number[], values: Value[]) => {
      const previous = previousArrays.get(base);
      // Share unchanged snapshots; copy a changed array so rewind cannot
      // see writes that happened after the selected step.
      const snapshot = previous?.cells.length === values.length && values.every((value,i) => Object.is(value, previous.cells[i]))
        ? previous : { base, dimensions: [...dimensions], cells: [...values] };
      arrays.set(base, snapshot);
      return snapshot;
    };
    const visible: FrameView[] = frames.map(frame => {
      const variables = Object.fromEntries([...frame.vars].flatMap(([key, variable]): [string, FrameVariable][] => {
        const { array, arrayBase, dimensions, address } = variable;
        const fixed = !variable.pointer && typeof variable.value === "number" ? fixedObjects.get(variable.value) : undefined;
        if (fixed && program.fixedStructFields.has(variable.type)) {
          const fields: [string, FrameVariable][] = [[key, { type: variable.type, value: `0x${fixed.address.toString(16)}`, storage: fixed.address, pointer: false }]];
          for (const member of fixed.members.values()) {
            const snapshot = member.values ? captureArray(member.address, [member.values.length], member.values) : undefined;
            fields.push([`${key}.${member.name}`, {
              type: snapshot ? `${member.type}[${snapshot.cells.length}]` : member.type,
              value: snapshot ? `${snapshot.cells.length} cells` : member.scalar === null ? "uninitialized" : String(member.scalar),
              storage: member.address, pointer: false, ...(snapshot ? {array: snapshot} : {}),
            }]);
          }
          return fields;
        }
        const snapshot = array && arrayBase !== undefined && dimensions ? captureArray(arrayBase, dimensions, array) : undefined;
        return [[key, { type: `${variable.type}${variable.pointer ? " *" : ""}`,
          value: array ? `[${array.join(", ")}]` : String(variable.value), pointer: variable.pointer,
          ...(address !== undefined ? {storage:address} : {}), ...(snapshot ? {array:snapshot} : {}),
          ...(variable.type === "int" && variable.pointerDepth === 2 && variable.pointer && !variable.matrixColumnCount
            && typeof variable.value === "number" && memory.allocationAt(variable.value)?.address === variable.value
            ? {heapIntRows: true as const} : {}),
          ...(variable.pointer && !array && typeof variable.value === "string" ? { stringPointer: true } : {}) }]];
      }));
      return { invocation: frame.invocation, name: frame.name, variables,
        locals: Object.fromEntries(Object.entries(variables).map(([key, variable]) => [key, variable.value])) };
    });
    previousArrays = arrays;
    const pointers = frames.flatMap(frame => [...frame.vars].flatMap(([name, variable]) => variable.pointer && typeof variable.value === "number" ? [{ from: `${frame.name}.${name}`, to: variable.value, label: name, dangling: Boolean(memory.allocations.find(a => a.address === variable.value)?.freeStep !== undefined) }] : []));
    const heapViews = [...heap.values()].map(object => {
      // An anonymous struct has no unique runtime type name in this VM.
      const fields = object.type && object.type !== "struct" ? program.structPointerFields.get(object.type) : undefined;
      const doublyLinked = fields?.has("next") && fields.has("prev");
      const treeChildAliases = object.type ? program.aliasedTreeStructs.get(object.type) : undefined;
      for (const [label, value] of object.fields) {
        if (typeof value !== "number" || (!["next", "left", "right"].includes(label) && !(doublyLinked && label === "prev") && !treeChildAliases?.some(field => field === label))) continue;
        if (label === "prev" && value === 0) continue;
        pointers.push({ from: `0x${object.address.toString(16)}.${label}`, to: value, label, dangling: Boolean(memory.allocations.find(a => a.address === value)?.freeStep !== undefined) });
      }
      return { address: object.address, type: object.type, fields: Object.fromEntries([...object.fields].map(([key, value]) => [key, String(value)])), ...(doublyLinked ? {doublyLinked:true as const} : {}), ...(treeChildAliases ? { treeChildAliases } : {}) };
    });
    trace.add({ line, stdout, memory: memory.snapshot(), frames: visible, heap: heapViews, pointers, event, message });
    steps++;
  };
  // An open interactive stream is not EOF. Replay starts with fresh VM state;
  // the suspended snapshot is only for display, never resumed as a checkpoint.
  class InputNeeded { constructor(public line: number) {} }
  const needInput = (line: number): never => {
    record(line, "step", "Waiting for input. Enter a line or send EOF.");
    throw new InputNeeded(line);
  };
  const runtimeError = (reason: string, line: number, allocation?: ReturnType<Memory["find"]>): never => { throw new MemoryFault(reason, line, steps, allocation); };
  const checkMemberLifetime = (member: FixedMember, line: number) => {
    if (!frames.some(frame => frame.invocation === member.invocation)) runtimeError("struct member used after its function returned", line);
  };
  const fixedCell = (member: FixedMember, index: number, line: number, addressOnly = false): Ref => {
    checkMemberLifetime(member, line);
    const values = member.values!;
    if (!Number.isInteger(index) || index < 0 || index >= values.length)
      runtimeError(`array member '${member.name}' index out of bounds (${index}); valid indexes: 0 through ${values.length - 1}`, line);
    const result: Ref = {
      address: member.address + member.stride * index,
      get: () => {
        checkMemberLifetime(member, line);
        const value = values[index];
        if (value === null) runtimeError(`uninitialized read of '${member.name}[${index}]'`, line);
        return value;
      },
      set: value => {
        checkMemberLifetime(member, line);
        values[index] = member.type === "char" ? String.fromCharCode(asNum(value) & 255) : asNum(value) | 0;
      },
    };
    if (addressOnly) locations.set(result.address!, result);
    return result;
  };
  const addressFor = (expression: Expr, line: number) => {
    const value = asNum(evaluate(expression)); const allocation = memory.find(value);
    if (allocation?.freeStep !== undefined) runtimeError("use-after-free", line, allocation);
    const array = arrayRefs.get(value); if (array) return { value, array };
    if (value === 0) runtimeError("null pointer dereference", line);
    if (!allocation) runtimeError("invalid pointer dereference", line);
    return { value };
  };
  const liveRef = (reference: Ref, line: number): Ref => {
    const check = () => {
      if (reference.allocation?.freeStep !== undefined) runtimeError("use-after-free", line, reference.allocation);
    };
    // The right-hand side of an assignment can free the owner after the lvalue
    // is resolved. Validate at each actual read/write, not just ref creation.
    return { ...reference, get: () => { check(); return reference.get(); }, set: value => { check(); reference.set(value); } };
  };
  const addressedArrayCells = new Map<number, { array: LocalArray; index: number; owner: NonNullable<LocalArray["owner"]> }>();
  const rememberArrayCell = (base: number, index: number, variable?: RuntimeVariable) => {
    const array = arrayRefs.get(base), owner = array?.owner;
    if (!array || !owner || variable && (variable.type !== "int" || variable.pointer && variable.pointerDepth !== 1)) return;
    const address = base + 4 * index;
    // The holder records the owning array, not a detached value. The line is
    // supplied by the operations below so a later access can point to the fault.
    addressedArrayCells.set(address, { array, index, owner });
  };
  const addressedCellRef = (address: number, line: number): Ref | undefined => {
    const cell = addressedArrayCells.get(address);
    if (!cell) return undefined;
    const { owner, array, index } = cell;
    const check = () => {
      if (!frames.some(frame => frame.vars === owner.vars) || owner.vars.get(owner.name) !== owner.variable)
        runtimeError("local array cell used outside its lifetime", line);
    };
    return { address, get: () => { check(); return array.values[index]; }, set: value => { check(); array.values[index] = value; } };
  };
  // Resolve types, not values or side effects, for the matrix forms rooted
  // at a named heap-backed int**. General C pointer inference is separate.
  const matrixPointerDepth = (expr: Expr): 0 | 1 | 2 | undefined => {
    if (expr.kind === "name") {
      const candidate = pointerMeta(expr);
      return candidate?.pointerDepth === 2 && candidate.type === "int" && !candidate.array &&
        !candidate.matrixColumnCount && typeof candidate.value === "number" &&
        memory.allocationAt(candidate.value) !== undefined ? 2 : undefined;
    }
    if (expr.kind === "index" || expr.kind === "unary" && expr.op === "*") {
      const depth = matrixPointerDepth(expr.kind === "index" ? expr.object : expr.expr);
      return depth === 2 ? 1 : depth === 1 ? 0 : undefined;
    }
    if (expr.kind === "unary" && expr.op === "&") {
      const depth = matrixPointerDepth(expr.expr);
      return depth === 0 ? 1 : depth === 1 ? 2 : undefined;
    }
    if (expr.kind === "binary" && (expr.op === "+" || expr.op === "-")) {
      const left = matrixPointerDepth(expr.left), right = matrixPointerDepth(expr.right);
      if (left && !right) return left;
      if (right && !left && expr.op === "+") return right;
    }
    return undefined;
  };
  const matrixRef = (base: number, index: number, depth: 1 | 2, line: number): Ref => {
    const allocation = memory.allocationAt(base);
    if (!allocation) return runtimeError(base === 0 ? "null matrix row pointer" : "invalid matrix row address", line);
    const rowTable = depth === 2;
    const stride = rowTable ? SIM_POINTER_BYTES : 4;
    const address = base + index * stride;
    if (allocation.freeStep !== undefined) runtimeError("use-after-free", line, allocation);
    const label = rowTable ? "heap matrix row" : "heap matrix column";
    if (!Number.isSafeInteger(index) || address < allocation.address ||
        address + stride > allocation.address + allocation.size || (address - allocation.address) % stride !== 0)
      runtimeError(`${label} index out of bounds (${index})`, line, allocation);
    return { address, allocation,
      get: () => {
        if (allocation.freeStep !== undefined) runtimeError("use-after-free", line, allocation);
        return cells.get(address) ?? memory.read(address, steps, line);
      },
      set: value => {
        const number = asNum(value) | 0;
        memory.writeInt32(address, number, steps, line);
        cells.set(address, number);
        if (rowTable && number !== 0) {
          const row = memory.allocationAt(number);
          if (row?.address === number && !row.type && row.freeStep === undefined) {
            row.type = "int"; row.elementSize = 4; row.elementType = "int";
          }
        }
      },
    };
  };
  const ref = (expression: Expr, addressOnly = false): Ref => {
    if (expression.kind === "name") {
      const variable = findVariable(expression.name); if (!variable) throw new Error(`line ${expression.line}: unknown variable ${expression.name}`);
      if (!variable.pointer && program.fixedStructFields.has(variable.type) && typeof variable.value === "number") {
        return { get: () => variable.value, set: () => runtimeError("whole-struct assignment is not supported for array members", expression.line), address: variable.value };
      }
      if (variable.array) return { get: () => variable.array![0], set: () => runtimeError("array is not assignable", expression.line), address: variable.arrayBase };
      if (!variable.address) variable.address = nextStackAddress++;
      const result = { get: () => variable.value, set: (value: Value) => { variable.value = value; }, address: variable.address };
      locations.set(variable.address, result); return result;
    }
    if (expression.kind === "member") {
      const object = evaluate(expression.object);
      const fixed = fixedObjects.get(asNum(object));
      if (fixed) {
        const member = fixed.members.get(expression.name);
        if (!member) return runtimeError(`unknown struct member '${expression.name}'`, expression.line);
        checkMemberLifetime(member, expression.line);
        if (member.values) return { get: () => member.address, set: () => runtimeError("array member is not assignable", expression.line), address: member.address };
        const result: Ref = { address: member.address, get: () => {
          checkMemberLifetime(member, expression.line);
          if (member.scalar === null) runtimeError(`uninitialized read of '${member.name}'`, expression.line);
          return member.scalar;
        }, set: value => { checkMemberLifetime(member, expression.line); member.scalar = asNum(value) | 0; } };
        if (addressOnly) locations.set(member.address, result);
        return result;
      }
      if (program.fixedStructFields.has(pointerMeta(expression.object)?.type ?? "") && asNum(object) !== 0)
        runtimeError("fixed array members are currently supported only on local struct objects", expression.line);
      const allocation = memory.find(asNum(object));
      if (!allocation) runtimeError(asNum(object) === 0 ? "null pointer dereference" : "invalid pointer dereference", expression.line);
      if (allocation!.freeStep !== undefined) runtimeError("use-after-free", expression.line, allocation);
      const block = heap.get(asNum(object)); if (!block) runtimeError("invalid pointer dereference", expression.line);
      // Typed child aliases also work when a lab assigns malloc to a
      // predeclared pointer, so the allocation did not get a declaration hint.
      const owner = pointerMeta(expression.object);
      if (block && !block.type && owner?.pointerDepth === 1 && program.aliasedTreeStructs.has(owner.type))
        block.type = owner.type;
      const fieldIndex = ["data", "value", "key", "left", "right", "next", "prev"].indexOf(expression.name);
      const address = block!.address + (fieldIndex < 0 ? block!.fields.size : fieldIndex) * 4;
      const result = { get: () => block!.fields.get(expression.name) ?? null, set: (value: Value) => block!.fields.set(expression.name, value), address, allocation };
      locations.set(address, result);
      return liveRef(result, expression.line);
    }
    if (expression.kind === "index") {
      const index = asNum(evaluate(expression.index));
      if (expression.object.kind === "index" && expression.object.object.kind === "name") {
        const outerVariable = findVariable(expression.object.object.name);
        const base = outerVariable?.arrayBase ?? (outerVariable?.matrixColumnCount ? outerVariable.value : undefined);
        const matrix = typeof base === "number" ? arrayRefs.get(base) : undefined;
        if (outerVariable?.matrixColumnCount && (!matrix || matrix.dimensions.length !== 2 ||
            matrix.dimensions[1] !== outerVariable.matrixColumnCount || matrix.type !== outerVariable.type))
          runtimeError("matrix parameter no longer points to a compatible local matrix", expression.line);
        if (outerVariable && matrix) {
          // Resolve the row once: evaluating the inner index expression first
          // would repeat side effects such as matrix[row++][column].
          const outer = asNum(evaluate(expression.object.index)); const width = matrix.dimensions[1] ?? 1; const flat = outer * width + index;
          // Validate both dimensions before flattening. Address formation
          // alone may point one past the row; no read/write.
          if (!Number.isInteger(outer) || outer < 0 || outer >= matrix.dimensions[0])
            runtimeError(`matrix row index out of bounds (${outer}); valid row indexes: 0 through ${matrix.dimensions[0] - 1}`, expression.line);
          if (!Number.isInteger(index) || index < 0 || index > width || (!addressOnly && (index === width || flat >= matrix.values.length)))
            runtimeError(`matrix column index out of bounds (${index}); valid column indexes${addressOnly ? " for address-of" : ""}: 0 through ${addressOnly ? width : width - 1}`, expression.line);
          return { get: () => matrix.values[flat], set: value => { matrix.values[flat] = value; }, address: (base as number) + flat * (outerVariable.elementSize ?? 4) };
        }
      }
      if (pointerMeta(expression.object)?.matrixColumnCount)
        runtimeError("matrix row used without a column; row values are not supported", expression.line);
      const base = asNum(evaluate(expression.object));
      const member = fixedArrays.get(base);
      if (member) return fixedCell(member, index, expression.line, addressOnly);
      const variable = pointerMeta(expression.object); const array = expression.object.kind === "name" ? findVariable(expression.object.name)?.array : undefined;
      if (array) {
        if (!Number.isInteger(index) || index < 0 || index >= array.length) runtimeError(`array index out of bounds (${index})`, expression.line);
        if (addressOnly) rememberArrayCell(base, index, variable);
        return { get: () => array[index], set: value => { array[index] = value; }, address: base + index * (variable?.elementSize ?? 4) };
      }
      const baseArray = arrayRefs.get(base);
      if (baseArray) {
        if (!Number.isInteger(index) || index < 0 || index >= baseArray.values.length) runtimeError(`pointer index out of bounds (${index})`, expression.line);
        if (addressOnly) rememberArrayCell(base, index, variable);
        return { get: () => baseArray.values[index], set: value => { baseArray.values[index] = value; }, address: base + index * (variable?.elementSize ?? elementSize(baseArray.type)) };
      }
      const depth = matrixPointerDepth(expression.object);
      if (depth === 1 || depth === 2) return matrixRef(base, index, depth, expression.line);
      const size = variable?.elementSize ?? memory.allocationAt(base)?.elementSize ?? 1; const address = base + index * size; const allocation = memory.allocationAt(address);
      if (!allocation || address < allocation.address || address + size > allocation.address + allocation.size) runtimeError(`pointer index out of bounds (${index})`, expression.line, allocation);
      return {
        get: () => {
          if (allocation!.freeStep !== undefined) runtimeError("use-after-free", expression.line, allocation);
          return cells.get(address) ?? memory.read(address, steps, expression.line);
        },
        set: value => { cells.set(address, value); memory.write(address, asNum(value), steps, expression.line); },
        address,
      };
    }
    if (expression.kind === "unary" && expression.op === "*") {
      const depth = matrixPointerDepth(expression.expr);
      const address = asNum(evaluate(expression.expr));
      if (depth === 1 || depth === 2) return matrixRef(address, 0, depth, expression.line);
      const allocation = memory.find(address);
      const location = locations.get(address);
      if (location) return liveRef(location, expression.line);
      const localCell = addressedCellRef(address, expression.line);
      if (localCell) return localCell;
      const fixedArray = fixedArrays.get(address);
      if (fixedArray) return fixedCell(fixedArray, 0, expression.line);
      if (!allocation) runtimeError(address === 0 ? "null pointer dereference" : "invalid pointer dereference", expression.line);
      if (allocation!.freeStep !== undefined) runtimeError("use-after-free", expression.line, allocation);
      return { get: () => cells.get(address) ?? memory.read(address, steps, expression.line), set: value => { cells.set(address, value); memory.write(address, asNum(value), steps, expression.line); }, address };
    }
    throw new Error(`line ${expression.line}: expression is not assignable (${expression.kind})`);
  };
  const readString = (value: Value, line: number, precision?: number) => {
    if (typeof value === "string") return value.split("\0", 1)[0];
    if (typeof value === "number" && inFixedStorage(value)) {
      let member = fixedArrays.get(value);
      if (!member) {
        // The member map follows ascending address order. Only character
        // arrays can contain an interior address passed as a string.
        for (const candidate of fixedArrays.values()) {
          if (candidate.address >= value) break;
          if (candidate.type === "char" && value - candidate.address < candidate.values!.length) {
            member = candidate;
            break;
          }
        }
      }
      if (!member || member.type !== "char" || !Number.isSafeInteger(value))
        return runtimeError("string address is not inside a struct character array", line);
      checkMemberLifetime(member, line);
      const chars = member.values!;
      const offset = value - member.address;
      const end = Math.min(chars.length, offset + (precision ?? Infinity));
      let text = "";
      for (let index = offset; index < end; index++) {
        const cell = chars[index];
        if (cell === null) runtimeError(`uninitialized read of '${member.name}[${index}]' in string`, line);
        if (cell === "\0" || cell === 0) return text;
        text += typeof cell === "number" ? String.fromCharCode(cell & 255) : cell;
      }
      if (precision !== undefined && end - offset === precision) return text;
      return runtimeError(`unterminated string in struct member '${member.name}'`, line);
    }
    const variable = [...frames].reverse().flatMap(frame => [...frame.vars.values()]).find(candidate => candidate.arrayBase === value);
    if (variable?.array) return variable.array.map(item => typeof item === "number" ? String.fromCharCode(item & 255) : String(item ?? "\0")).join("").split("\0", 1)[0];
    // Interior pointers into live local char buffers refer to their suffix, not
    // the unrelated heap-cell map. Use live variables rather than stale refs.
    if (typeof value === "number" && !memory.allocationAt(value)) {
      for (const frame of [...frames].reverse()) {
        for (const candidate of frame.vars.values()) {
          if (!candidate.array || candidate.arrayBase === undefined || candidate.type !== "char") continue;
          const offset = value - candidate.arrayBase;
          if (Number.isInteger(offset) && offset >= 0 && offset < candidate.array.length)
            return candidate.array.slice(offset).map(item => typeof item === "number" ? String.fromCharCode(item & 255) : String(item ?? "\0")).join("").split("\0", 1)[0];
        }
      }
    }
    if (typeof value === "number") {
      const allocation = memory.allocationAt(value);
      if (allocation?.freeStep !== undefined) runtimeError("use-after-free", line, allocation);
      let result = ""; for (let index = 0; index < 256; index++) { const cell = cells.get(value + index); if (cell === undefined || cell === 0 || cell === "\0") break; result += typeof cell === "number" ? String.fromCharCode(cell & 255) : String(cell); } return result; }
    return "";
  };
  const signedBase = (type: string) => type.split(/\s+/).filter(word => word !== "const" && word !== "static").join(" ");
  const promotedSignedInteger = (type: string) => ["int", "char", "short", "short int"].includes(signedBase(type));
  // Determine the small signed-integer subset the VM can simulate correctly.
  // A machine address or a whole-valued double is still not an integer operand.
  // This reads type information only; it never evaluates an index or call.
  const scalarLvalueType = (expr: Expr): string | undefined => {
    if (expr.kind === "name") {
      const variable = findVariable(expr.name);
      return variable && !variable.pointer && !variable.array ? variable.type : undefined;
    }
    if (expr.kind === "index") {
      const variable = pointerMeta(expr.object);
      if (variable && !variable.matrixColumnCount && (variable.array ? !variable.pointerDepth : variable.pointerDepth === 1) && (variable.dimensions?.length ?? 1) === 1) return variable.type;
      if (expr.object.kind === "index") {
        const matrix = pointerMeta(expr.object.object);
        if (matrix && (matrix.matrixColumnCount || (matrix.array && !matrix.pointerDepth && matrix.dimensions?.length === 2))) return matrix.type;
      }
    }
    if (expr.kind === "unary" && expr.op === "*") {
      const variable = pointerMeta(expr.expr);
      if (variable?.pointerDepth === 1) return variable.type;
    }
  };
  const hasIntegerProvenance = (expr: Expr): boolean => {
    if (expr.kind === "literal") return expr.literalKind === "char"
      || (expr.literalKind !== "floating" && typeof expr.value === "number");
    if (expr.kind === "name") {
      const variable = findVariable(expr.name);
      if (variable) return !variable.pointer && !variable.array && promotedSignedInteger(variable.type);
      return expr.name === "EOF" || (typeof program.constants.get(expr.name) === "number" && !program.floatingConstants.has(expr.name));
    }
    if (expr.kind === "call") {
      if (["getchar", "strcmp", "printf", "scanf"].includes(expr.name)) return true;
      const fn = program.functions.get(expr.name);
      return Boolean(fn && !fn.returnsPointer && promotedSignedInteger(fn.returnType));
    }
    if (expr.kind === "conditional") return hasIntegerProvenance(expr.yes) && hasIntegerProvenance(expr.no);
    if (expr.kind === "cast") return !expr.pointer && signedBase(expr.type) === "int" && hasIntegerProvenance(expr.expr);
    if (expr.kind === "binary") return (expr.op === "," || hasIntegerProvenance(expr.left)) && hasIntegerProvenance(expr.right);
    if (expr.kind === "unary" && ["!", "-", "++", "--"].includes(expr.op)) return hasIntegerProvenance(expr.expr);
    const type = scalarLvalueType(expr);
    return type !== undefined && promotedSignedInteger(type);
  };
  // Classify the C expression rather than its JS value: 241 in a float is
  // still floating point. Inspect types only, never execute operands twice.
  const isFloatingType = (type: string | undefined) =>
    type !== undefined && ["float", "double"].includes(signedBase(type));
  const hasFloatingProvenance = (expr: Expr): boolean => {
    switch (expr.kind) {
      case "literal": return expr.literalKind === "floating";
      case "name": {
        const variable = findVariable(expr.name);
        return variable ? isFloatingType(scalarLvalueType(expr)) : program.floatingConstants.has(expr.name);
      }
      case "call": {
        const fn = program.functions.get(expr.name);
        return Boolean(fn && !fn.returnsPointer && isFloatingType(fn.returnType));
      }
      case "cast": return !expr.pointer && isFloatingType(expr.type);
      case "conditional": return hasFloatingProvenance(expr.yes) || hasFloatingProvenance(expr.no);
      case "binary":
        if (expr.op === ",") return hasFloatingProvenance(expr.right);
        if (["=", "+=", "-="].includes(expr.op)) return isFloatingType(scalarLvalueType(expr.left));
        return ["+", "-", "*", "/"].includes(expr.op) &&
          (hasFloatingProvenance(expr.left) || hasFloatingProvenance(expr.right));
      case "unary":
        if (expr.op === "-") return hasFloatingProvenance(expr.expr);
        if (["++", "--"].includes(expr.op)) return isFloatingType(scalarLvalueType(expr.expr));
      default: return isFloatingType(scalarLvalueType(expr));
    }
  };
  const fitsSignedInt = (value: number) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
  const evaluate = (expression: Expr): Value => {
    if (expression.kind === "literal") return expression.value;
    if (expression.kind === "name") {
      const variable = findVariable(expression.name);
      if (variable) return variable.array ? variable.arrayBase ?? 0 : variable.value;
      if (program.constants.has(expression.name)) return program.constants.get(expression.name)!;
      if (expression.name === "EOF") return -1;
      return runtimeError(`unknown variable ${expression.name}`, expression.line);
    }
    if (expression.kind === "member" || expression.kind === "index" || (expression.kind === "unary" && expression.op === "*")) return ref(expression).get();
    if (expression.kind === "cast") return evaluate(expression.expr);
    if (expression.kind === "conditional") return asNum(evaluate(expression.test)) ? evaluate(expression.yes) : evaluate(expression.no);
    if (expression.kind === "unary") {
      if (expression.op === "!" || expression.op === "-") { const old = asNum(evaluate(expression.expr)); return expression.op === "!" ? (old ? 0 : 1) : -old; }
      const reference = ref(expression.expr, expression.op === "&");
      if (expression.op === "&") {
        const variable = expression.expr.kind === "name" ? findVariable(expression.expr.name) : undefined;
        return variable && !variable.pointer && variable.type.startsWith("struct") && typeof variable.value === "number" ? variable.value : reference.address ?? 0;
      }
      const old = asNum(reference.get());
      if (expression.op === "++" || expression.op === "--") { const variable = pointerMeta(expression.expr); const delta = variable?.pointer ? (variable.elementSize ?? 1) : 1; const value = old + (expression.op === "++" ? delta : -delta); reference.set(value); return expression.postfix ? old : value; }
    }
    if (expression.kind === "call") {
      const args = expression.args;
      const expectedArguments = builtinArgumentCounts.get(expression.name);
      if (expectedArguments !== undefined && args.length !== expectedArguments)
        runtimeError(`function '${expression.name}' expects ${expectedArguments} arguments, received ${args.length}`, expression.line);
      if (expression.name === "scanf" && args.length === 0)
        runtimeError("missing scanf format argument", expression.line);
      if (expression.name === "sizeof") {
        const argument = args[0];
        const sized = argument?.kind === "index" ? argument.object : argument;
        if (sized?.kind === "member") {
          const owner = pointerMeta(sized.object);
          const fields = owner && program.fixedStructFields.get(owner.type);
          if (fields) {
            const member = fields.get(sized.name);
            if (!member || argument?.kind === "index" && member.length === null)
              return runtimeError("invalid struct field in sizeof", expression.line);
            const stride = member.type === "char" ? 1 : 4;
            return argument?.kind === "index" ? stride : stride * (member.length ?? 1);
          }
        }
        if (argument?.kind === "name" || argument?.kind === "unary" && argument.op === "*") {
          const variable = pointerMeta(argument.kind === "name" ? argument : argument.expr);
          const fields = variable && program.fixedStructFields.get(variable.type);
          if (fields && variable && (argument.kind === "name" && !variable.pointer || argument.kind === "unary" && variable.pointerDepth === 1))
            return fixedStructBytes(fields);
        }
        const arrayBytes = localArraySizeof(argument, sizeofContext, runtimeError);
        if (arrayBytes !== undefined) return arrayBytes;
        const pointerBytes = pointerOperandSizeof(argument, sizeofContext, runtimeError, type => {
          const fields = program.fixedStructFields.get(type);
          return fields ? fixedStructBytes(fields) : elementSize(type);
        });
        if (pointerBytes !== undefined) return pointerBytes;
        if (argument?.kind === "name") {
          const variable = findVariable(argument.name);
          if (variable && !variable.pointer && !variable.array) {
            const type = variable.type.split(/\s+/).filter(part => part !== "const" && part !== "static").join(" ");
            if (type === "int" || type === "char") return elementSize(type);
          }
        }
        if (argument?.kind === "literal") return argument.value;
        if (argument?.kind === "name" && argument.name === "char") return 1;
        if (argument?.kind === "name" && argument.name === "int") return 4;
        if (argument?.kind === "unary" && argument.expr.kind === "name") {
          const variable = findVariable(argument.expr.name);
          if (variable?.pointer) return elementSize(variable.type);
        }
        return 16;
      }
      if (expression.name === "malloc") return allocate(asNum(evaluate(args[0])), expression.line);
      if (expression.name === "calloc") {
        const count = asNum(evaluate(args[0]));
        const elementBytes = asNum(evaluate(args[1]));
        const size = count * elementBytes;
        const address = allocate(size, expression.line);
        for (let i = 0; i < size; i++) memory.write(address + i, 0, steps, expression.line);
        return address;
      }
      if (expression.name === "realloc") {
        const old = asNum(evaluate(args[0])); const size = asNum(evaluate(args[1]));
        const address = allocate(size, expression.line); const oldAllocation = memory.find(old);
        if (oldAllocation) {
          const copiedBytes = Math.min(size, oldAllocation.size);
          memory.copyAllocationState(old, address, copiedBytes, steps, expression.line);
          for (let i = 0; i < copiedBytes; i++) {
            if (cells.has(old + i)) cells.set(address + i, cells.get(old + i)!);
          }
        }
        if (old) { memory.free(old, steps, expression.line); record(expression.line, "free"); }
        return address;
      }
      if (expression.name === "free") { const address = asNum(evaluate(args[0])); memory.free(address, steps, expression.line); record(expression.line, address === 0 ? "step" : "free"); return null; }
      if (expression.name === "strlen") return readString(evaluate(args[0]), expression.line).length;
      if (expression.name === "strcpy" || expression.name === "strcat") {
        const destination = asNum(evaluate(args[0]));
        if (inFixedStorage(destination))
          runtimeError(expression.name + " cannot write to fixed struct members yet", expression.line);
        const source = readString(evaluate(args[1]), expression.line);
        const existing = expression.name === "strcat" ? readString(destination, expression.line) : "";
        const result = existing + source;
        // Interior char pointers must update the live local buffer, including
        // its terminator, rather than an unrelated heap-cell entry.
        if (!memory.allocationAt(destination)) {
          for (const frame of [...frames].reverse()) {
            for (const variable of frame.vars.values()) {
              if (!variable.array || variable.arrayBase === undefined || variable.type !== "char") continue;
              const offset = destination - variable.arrayBase;
              if (!Number.isInteger(offset) || offset < 0 || offset >= variable.array.length) continue;
              if (result.length + 1 > variable.array.length - offset)
                runtimeError(expression.name + " exceeds local array bounds", expression.line);
              for (let i = 0; i < result.length; i++) variable.array[offset + i] = result[i];
              variable.array[offset + result.length] = "\0";
              return destination;
            }
          }
        }
        const allocation = memory.find(destination);
        if (!allocation) runtimeError(destination === 0 ? "null pointer dereference" : "invalid pointer dereference", expression.line);
        if (allocation!.freeStep !== undefined) runtimeError("use-after-free", expression.line, allocation);
        if (result.length + 1 > allocation!.address + allocation!.size - destination)
          runtimeError(expression.name + " exceeds heap allocation bounds", expression.line, allocation);
        // Keep the memory canvas and realloc shadow state consistent with cells.
        // The terminating NUL is a write too; untouched capacity stays indeterminate.
        for (let i = 0; i <= result.length; i++) {
          const value = i === result.length ? 0 : result.charCodeAt(i);
          memory.write(destination + i, value, steps, expression.line);
          cells.set(destination + i, i === result.length ? 0 : result[i]);
        }
        return destination;
      }
      if (expression.name === "strcmp") {
        // C compares unsigned bytes, not language-dependent collation.
        // Compare UTF-8 encoded strings, stopping at their first NUL.
        const encoder = new TextEncoder();
        const left = encoder.encode(readString(evaluate(args[0]), expression.line).split("\0", 1)[0]);
        const right = encoder.encode(readString(evaluate(args[1]), expression.line).split("\0", 1)[0]);
        for (let i = 0; i <= Math.min(left.length, right.length); i++) {
          const difference = (left[i] ?? 0) - (right[i] ?? 0);
          if (difference !== 0) return difference;
        }
        return 0;
      }
      if (expression.name === "memset") {
        const destination = asNum(evaluate(args[0]));
        const value = asNum(evaluate(args[1]));
        const length = asNum(evaluate(args[2]));
        if (!Number.isSafeInteger(length) || length < 0) runtimeError("invalid memset length", expression.line);
        if (length === 0) return destination;
        if (!Number.isSafeInteger(destination)) runtimeError("invalid pointer dereference", expression.line);
        const byte = value & 255;
        // Preserve heap dispatch when simulated stack and heap ranges overlap.
        const heapDestination = memory.allocationAt(destination);
        for (const [base, array] of heapDestination ? [] : arrayRefs) {
          const size = elementSize(array.type);
          const offset = destination - base;
          if (offset < 0 || offset >= array.values.length * size) continue;
          if (length > array.values.length * size - offset) runtimeError("memset exceeds local array bounds", expression.line);
          // Local arrays store values, not object-representation bytes. Do not
          // guess endian/float/struct layouts for partial or nonzero fills.
          if (size === 1) {
            for (let i = 0; i < length; i++) array.values[offset + i] = String.fromCharCode(byte);
          } else if (array.type === "int" && byte === 0 && offset % size === 0 && length % size === 0) {
            for (let i = offset / size; i < (offset + length) / size; i++) array.values[i] = 0;
          } else {
            runtimeError("unsupported memset on local array: use char bytes or whole int elements with zero fill", expression.line);
          }
          return destination;
        }
        for (let i = 0; i < length; i++) {
          memory.write(destination + i, value, steps, expression.line);
          cells.set(destination + i, value);
        }
        return destination;
      }
      if (expression.name === "scanf") {
        const format = readString(evaluate(args[0]), expression.line).split("\0", 1)[0];
        // Evaluate every destination once, before scanning, as with ordinary calls.
        const destinations = args.slice(1).map(argument => ({
          matrixInt: matrixPointerDepth(argument) === 1,
          address: asNum(evaluate(argument)),
        }));
        let assigned = 0; let destinationIndex = 0; let inputFailure = false;
        const write = (address: number, value: Value) => {
          const allocation = memory.find(address);
          if (allocation?.freeStep !== undefined) runtimeError("use-after-free", expression.line, allocation);
          const location = locations.get(address);
          if (location) { location.set(value); return; }
          for (const [base, array] of arrayRefs) {
            const offset = address - base;
            const size = elementSize(array.type);
            if (offset >= 0 && offset < array.values.length * size && offset % size === 0) {
              array.values[offset / size] = value; return;
            }
          }
          memory.write(address, typeof value === "string" ? value.charCodeAt(0) : asNum(value), steps, expression.line);
          cells.set(address, value);
        };
        for (let i = 0; i < format.length; i++) {
          if (/\s/.test(format[i])) { while (/\s/.test(stdin[stdinCursor] ?? "") && stdinCursor < stdin.length) stdinCursor++; if (inputOpen && stdinCursor >= stdin.length) needInput(expression.line); continue; }
          if (format[i] !== "%" || format[i + 1] === "%") {
            const literal = format[i] === "%" ? format[++i] : format[i];
            if (stdinCursor >= stdin.length) { if (inputOpen) needInput(expression.line); inputFailure = true; break; }
            if (stdin[stdinCursor] !== literal) break;
            stdinCursor++; continue;
          }
          const conversion = format.slice(i).match(/^%(\*)?(\d*)([dcs\[])/);
          if (!conversion) runtimeError("unsupported scanf conversion", expression.line);
          const [, suppressed, widthText, specifier] = conversion!;
          i += conversion![0].length - 1;
          const scanset = specifier === "[" ? parseScanset(format, i + 1) : undefined;
          if (specifier === "[") {
            if (!scanset) return runtimeError("invalid or unsupported scanf scanset", expression.line);
            i = scanset.end;
          }
          const width = widthText ? Number(widthText) : specifier === "c" ? 1 : Infinity;
          if (width < 1) runtimeError("invalid scanf field width", expression.line);
          if (specifier === "d" || specifier === "s") while (stdinCursor < stdin.length && /\s/.test(stdin[stdinCursor])) stdinCursor++;
          if (stdinCursor >= stdin.length) { if (inputOpen) needInput(expression.line); inputFailure = true; break; }
          const remaining = stdin.slice(stdinCursor, Number.isFinite(width) ? stdinCursor + width : undefined);
          let token: string | undefined;
          if (scanset) {
            let matched = 0;
            while (matched < remaining.length && scanset.includes(remaining[matched])) matched++;
            token = remaining.slice(0, matched);
          } else {
            token = specifier === "d" ? remaining.match(/^[+-]?\d+/)?.[0] : specifier === "s" ? remaining.match(/^\S+/)?.[0] : remaining;
          }
          // A token at the end of an open stream may still grow. A field-width
          // boundary completes it; %c instead needs exactly its requested width.
          if (inputOpen && stdinCursor + remaining.length === stdin.length &&
              (specifier === "c" ? remaining.length < width :
               token ? token.length === remaining.length && token.length < width :
               specifier === "d" && remaining.length < width && /^[+-]$/.test(remaining))) needInput(expression.line);
          if (!token) {
            // A sign is a valid prefix of a decimal input item, even if no digit follows.
            if (specifier === "d" && /^[+-]/.test(remaining)) stdinCursor++;
            break;
          }
          stdinCursor += token.length;
          if (suppressed) continue;
          const target = destinations[destinationIndex++];
          if (target === undefined) return runtimeError("missing scanf destination", expression.line);
          const { address: destination, matrixInt } = target;
          if (specifier === "d") {
            if (matrixInt) matrixRef(destination, 0, 1, expression.line).set(Number(token));
            else write(destination, Number(token));
          }
          else {
            // Validate the entire conversion against its starting buffer. Checking
            // each byte independently can silently spill into an adjacent object.
            const terminate = specifier === "s" || scanset !== undefined;
            const bytes = token.length + Number(terminate);
            const allocation = memory.find(destination);
            if (allocation?.freeStep !== undefined) runtimeError("use-after-free", expression.line, allocation);
            // Match write()'s existing dispatch order. Simulated stack and heap
            // numbers can overlap; this guard must not change which object wins.
            if (scanset && locations.has(destination))
              runtimeError("scanf scanset requires a character buffer", expression.line);
            if (!locations.has(destination)) {
              const local = [...arrayRefs].find(([base, array]) => {
                const size = elementSize(array.type); const offset = destination - base;
                return offset >= 0 && offset < array.values.length * size && offset % size === 0;
              });
              if (local) {
                const [base, array] = local;
                if (scanset) {
                  const owner = array.scanBufferOwner;
                  if (!owner) return runtimeError("scanf scanset requires a writable one-dimensional character buffer declared directly in a function body", expression.line);
                  if (!frames.some(frame => frame.vars === owner.vars) || owner.vars.get(owner.name) !== owner.variable)
                    runtimeError("scanf scanset buffer used outside its lifetime", expression.line);
                }
                if (elementSize(array.type) === 1 && bytes > base + array.values.length - destination)
                  runtimeError("scanf exceeds local array bounds", expression.line);
              } else if (allocation && bytes > allocation.address + allocation.size - destination) {
                runtimeError("scanf exceeds heap allocation bounds", expression.line, allocation);
              } else if (scanset && !allocation) {
                runtimeError("scanf scanset requires a character buffer", expression.line);
              }
            }
            for (let offset = 0; offset < token.length; offset++) write(destination + offset, token[offset]);
            if (terminate) write(destination + token.length, "\0");
          }
          assigned++;
        }
        record(expression.line);
        return inputFailure && assigned === 0 ? -1 : assigned;
      }
      if (expression.name === "getchar") {
        if (stdinCursor >= stdin.length) { if (inputOpen) needInput(expression.line); record(expression.line); return -1; }
        const character = stdin[stdinCursor];
        stdinCursor++; record(expression.line); return character;
      }
      if (expression.name === "exit") { record(expression.line); throw new ExitSignal(); }
      if (expression.name === "printf") {
        if (args.length === 0) runtimeError("missing printf format argument", expression.line);
        const format = readString(evaluate(args[0]), expression.line).split("\0", 1)[0];
        const values = args.slice(1).map(argument => evaluate(argument)); let index = 0; let characterByteAdjustment = 0;
        const output = format.replace(/%([-+ 0]*)([0-9]*)(?:\.([0-9]*))?(lf|zu|[dcspf%])|%/g,
          (_match, flags: string, widthText: string, precisionText: string | undefined, specifier: string) => {
            if (_match === "%") runtimeError("unsupported or incomplete printf conversion", expression.line);
            if (specifier === "%") return "%";
            if (index >= values.length) runtimeError("missing printf argument", expression.line);
            const value = values[index++]; const width = Number(widthText || 0);
            const precision = precisionText === undefined ? undefined : Number(precisionText || 0);
            // Bound formatting allocations just as execution and memory are bounded.
            if (width > 10000 || (precision !== undefined && precision > 10000))
              runtimeError("printf width or precision exceeds simulator limit (10000)", expression.line);
            let text: string; let sign = "";
            if (specifier === "s") {
              text = readString(value, expression.line, precision).split("\0", 1)[0]; if (precision !== undefined) text = text.slice(0, precision);
            } else if (specifier === "c") {
              text = String.fromCharCode(asNum(value) & 255);
              characterByteAdjustment += 1 - new TextEncoder().encode(text).length;
            }
            else if (specifier === "d" || specifier === "zu" || specifier === "f" || specifier === "lf") {
              const integer = specifier === "d" || specifier === "zu";
              const number = specifier === "d" ? Math.trunc(asNum(value)) : asNum(value);
              if (specifier === "zu") {
                if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
                  runtimeError("printf %zu requires a nonnegative integer within the simulator's exact range", expression.line);
                if (flags.includes("+") || flags.includes(" "))
                  runtimeError("printf %zu does not support sign flags", expression.line);
              } else {
                sign = number < 0 || (!integer && Object.is(number, -0)) ? "-" : flags.includes("+") ? "+" : flags.includes(" ") ? " " : "";
              }
              if (integer) {
                text = Math.abs(number).toString();
                if (precision === 0 && number === 0) text = "";
                if (precision !== undefined) text = text.padStart(precision, "0");
              } else {
                if (precision !== undefined && precision > 100)
                  runtimeError("printf floating precision exceeds simulator limit (100)", expression.line);
                text = Math.abs(number).toFixed(precision ?? 6);
              }
            } else text = String(value ?? "");
            const padding = Math.max(0, width - sign.length - text.length);
            if (flags.includes("-")) return sign + text + " ".repeat(padding);
            if (flags.includes("0") && (specifier === "d" || specifier === "zu" ? precision === undefined : specifier === "f" || specifier === "lf"))
              return sign + "0".repeat(padding) + text;
            return " ".repeat(padding) + sign + text;
          });
        stdout += output; record(expression.line);
        return new TextEncoder().encode(output).length + characterByteAdjustment;
      }
      const fn = program.functions.get(expression.name);
      if (!fn) throw new MemoryFault(`line ${expression.line}: Memlens could not resolve '${expression.name}()'. Check the spelling and include the function definition if it is yours. If it is a library function, check Memlens’s supported C subset.`, expression.line, steps, undefined, true, "unresolved-function");
      if (args.length !== fn.params.length)
        runtimeError(`function '${fn.name}' expects ${fn.params.length} arguments, received ${args.length}`, expression.line);
      if (frames.length >= recursionLimit) runtimeError("stack overflow", expression.line);
      if ((!fn.returnsPointer && program.fixedStructFields.has(fn.returnType)) ||
          fn.params.some(param => !param.pointer && program.fixedStructFields.has(param.type)))
        runtimeError("structs with fixed array members cannot be passed or returned by value yet", expression.line);
      const values = args.map(argument => evaluate(argument));
      const vars = new Map<string, RuntimeVariable>();
      fn.params.forEach((parameter, index) => {
        if (parameter.name !== undefined) {
          const value = values[index] ?? null;
          let matrixColumnCount: number | undefined;
          if (parameter.matrixColumns) {
            if (!["int", "char"].includes(parameter.type) || !isFixedArrayBound(parameter.matrixColumns, sizeofContext))
              runtimeError("matrix parameters require a fixed column count and int or char elements", expression.line);
            matrixColumnCount = asNum(evaluate(parameter.matrixColumns));
            const argument = pointerMeta(args[index]);
            const storage = typeof value === "number" ? arrayRefs.get(value) : undefined;
            if ((!argument?.array && !argument?.matrixColumnCount) || storage?.dimensions.length !== 2 ||
                storage.dimensions[1] !== matrixColumnCount || storage.type !== parameter.type)
              runtimeError("matrix argument must be a two-dimensional local array with matching columns and element type", expression.line);
          }
          vars.set(parameter.name, { value, type: parameter.type, pointer: parameter.pointer,
            pointerDepth: parameter.pointerDepth, elementSize: elementSize(parameter.type), matrixColumnCount });
        }
      });
      frames.push({ invocation: nextInvocation++, name: fn.name, vars });
      record(expression.line, "call");
      let returned: Value = null; let failed = false;
      try { execute(fn.body, true); }
      catch (caught) {
        if (caught instanceof ReturnSignal) returned = caught.value;
        else {
          failed = !(caught instanceof ExitSignal);
          if (caught instanceof BreakSignal || caught instanceof ContinueSignal) runtimeError(caught.message, caught.line);
          throw caught;
        }
      } finally {
        // A fault stops execution in the active frames. Do not erase their
        // locals or add fictional returns before recording the error snapshot.
        if (!failed) { frames.pop(); record(expression.line, "return"); }
      }
      return returned;
    }
    if (expression.kind === "binary") {
      if (["*=", "/=", "%="].includes(expression.op)) {
        const target = scalarLvalueType(expression.left);
        const direct = pointerMeta(expression.left);
        if (direct?.pointer || direct?.array) runtimeError("invalid arithmetic compound assignment to pointer or array", expression.line);
        if (!target || signedBase(target) !== "int") runtimeError("arithmetic compound assignment requires a supported integer target (signed int)", expression.line);
        if (target!.split(/\s+/).includes("const")) runtimeError("arithmetic compound assignment cannot modify a const target", expression.line);
        if (!hasIntegerProvenance(expression.right)) runtimeError("arithmetic compound assignment requires supported integer operands", expression.line);
        const reference = ref(expression.left);
        const right = evaluate(expression.right);
        const previous = reference.get();
        const a = asNum(previous), b = asNum(right);
        if (previous === null || right === null || !fitsSignedInt(a) || !fitsSignedInt(b))
          runtimeError("arithmetic compound assignment requires supported integer operands in signed int range", expression.line);
        if (expression.op === "/=" && b === 0) runtimeError("division by zero", expression.line);
        if (expression.op === "%=" && b === 0) runtimeError("remainder by zero", expression.line);
        if (expression.op !== "*=" && a === -2147483648 && b === -1)
          runtimeError("arithmetic compound assignment overflows signed int", expression.line);
        const value = expression.op === "*=" ? a * b : expression.op === "/=" ? Math.trunc(a / b) : a % b;
        if (!fitsSignedInt(value)) runtimeError("arithmetic compound assignment overflows signed int", expression.line);
        reference.set(value); record(expression.line); return value;
      }
      if (["=", "+=", "-="].includes(expression.op)) { const reference = ref(expression.left); const right = evaluate(expression.right); const old = expression.op === "=" ? 0 : asNum(reference.get()); const pointer = pointerMeta(expression.left); const delta = pointer?.pointer ? (pointer.elementSize ?? 1) : 1; const value = expression.op === "=" ? right : old + (expression.op === "+=" ? asNum(right) * delta : -asNum(right) * delta); reference.set(value); record(expression.line); return value; }
      if (expression.op === ",") { evaluate(expression.left); return evaluate(expression.right); }
      // C logical operators evaluate the right operand only when needed.
      if (expression.op === "&&") return asNum(evaluate(expression.left)) ? (asNum(evaluate(expression.right)) ? 1 : 0) : 0;
      if (expression.op === "||") return asNum(evaluate(expression.left)) ? 1 : (asNum(evaluate(expression.right)) ? 1 : 0);
      const arithmetic = expression.op === "+" || expression.op === "-";
      const leftDepth = arithmetic ? matrixPointerDepth(expression.left) : undefined;
      const rightDepth = arithmetic ? matrixPointerDepth(expression.right) : undefined;
      const left = evaluate(expression.left); const right = evaluate(expression.right);
      const a = asNum(left), b = asNum(right);
      if (arithmetic) {
        // Keep address formation inside its original allocation. One-past
        // addresses need provenance not modeled by this numeric VM path.
        if (leftDepth && rightDepth)
          return runtimeError("arithmetic between two matrix pointers is not supported", expression.line);
        if (leftDepth)
          return matrixRef(a, expression.op === "+" ? b : -b, leftDepth, expression.line).address!;
        if (rightDepth && !leftDepth && expression.op === "+")
          return matrixRef(b, a, rightDepth, expression.line).address!;
        const pointer = pointerMeta(expression.left);
        if (pointer?.pointer) return a + (expression.op === "+" ? b : -b) * (pointer.elementSize ?? 1);
      }
      if (expression.op === "/") {
        if (b === 0) runtimeError("division by zero", expression.line);
        return hasFloatingProvenance(expression.left) || hasFloatingProvenance(expression.right)
          ? a / b : Math.trunc(a / b);
      }
      if (expression.op === "%" && b === 0) runtimeError("remainder by zero", expression.line);
      if (expression.op === "==" || expression.op === "!=") { const equal = typeof left === "string" || typeof right === "string" ? left === right : a === b; return expression.op === "==" ? (equal ? 1 : 0) : (equal ? 0 : 1); }
      return ({ "+": a + b, "-": a - b, "*": a * b, "%": a % b, "<": a < b ? 1 : 0, ">": a > b ? 1 : 0, "<=": a <= b ? 1 : 0, ">=": a >= b ? 1 : 0 } as Record<string, number>)[expression.op] ?? 0;
    }
    return null;
  };
  const allocate = (size: number, line: number) => { const address = memory.malloc(size, steps, line); heap.set(address, { address, fields: new Map() }); record(line, "alloc"); return address; };
  class ReturnSignal { constructor(public value: Value) {} }
  class ExitSignal {}
  // Keep normal loop control lightweight; convert escaped signals to faults only
  // at a function boundary rather than allowing them to control a caller's loop.
  class BreakSignal { readonly message: string; constructor(public readonly line: number) { this.message = `line ${line}: break outside loop or switch`; } }
  class ContinueSignal { readonly message: string; constructor(public readonly line: number) { this.message = `line ${line}: continue outside loop`; } }
  const execute = (statement: Stmt, allowDirectLocal = false): void => {
    if (steps >= stepLimit) runtimeError("step limit reached", statement.line);
    if (statement.kind === "block") {
      for (const child of statement.body)
        execute(child, allowDirectLocal && (child.kind !== "block" || child.declarationGroup === true));
      return;
    }
    if (statement.kind === "decl") {
      const variable: RuntimeVariable = { value: null, type: statement.type, pointer: statement.pointer, pointerDepth: statement.pointerDepth, elementSize: elementSize(statement.type) };
      const fixed = !statement.pointer && program.fixedStructFields.get(statement.type);
      if (fixed) {
        if (!allowDirectLocal || statement.staticStorage || statement.readOnly)
          runtimeError("fixed array structs currently need a non-static, non-const declaration directly in a function body", statement.line);
        if (statement.arrayLength || statement.init || statement.arrayInitializer)
          runtimeError("arrays of these structs and whole-struct initializers are not yet supported", statement.line);
        const layout = fixedStructLayout(fixed);
        const bytes = 4 + Math.ceil(layout.bytes / 4) * 4;
        if (nextFixedAddress + bytes - fixedAddressStart > fixedStorageBytes)
          runtimeError("fixed struct storage exceeds simulator limit (262144 bytes)", statement.line);
        const invocation = frames.at(-1)!.invocation;
        const address = nextFixedAddress;
        const members = new Map<string, FixedMember>();
        for (const { name, type, length, offset, stride } of layout.members) {
          const member: FixedMember = { name, type, stride, address: address + offset, invocation, scalar: null,
            ...(length === null ? {} : { values: Array<Value>(length).fill(null) }) };
          if (member.values) fixedArrays.set(member.address, member);
          members.set(name, member);
        }
        nextFixedAddress += bytes; // Keep separate objects beyond this object's storage.
        fixedObjects.set(address, { address, invocation, members });
        variable.value = address;
        variable.address = address;
        current().set(statement.name, variable);
        record(statement.line);
        return;
      }
      if (statement.arrayLength) {
        const bounds = statement.arrayLengths ?? [statement.arrayLength];
        variable.fixedArrayBounds = bounds.every(bound => isFixedArrayBound(bound, sizeofContext));
        const dimensions = bounds.map(lengthExpr => asNum(evaluate(lengthExpr)));
        if (dimensions.some(dimension => !Number.isSafeInteger(dimension) || dimension <= 0))
          runtimeError("array dimensions must be positive integers", statement.line);
        // Bound browser allocations before creating or initializing array storage.
        // This is a simulator resource limit, not a native C object-size limit.
        const maxLocalArrayBytes = 65536;
        const length = dimensions.reduce((total, dimension) => total * dimension, 1);
        if (!Number.isSafeInteger(length) || length > maxLocalArrayBytes / variable.elementSize!)
          runtimeError("local array exceeds simulator limit (65536 bytes)", statement.line);
        variable.dimensions = dimensions;
        variable.array = Array.from({ length }, () => statement.type.includes("char") ? "\0" : 0);
        variable.pointer = false;
        variable.arrayBase = nextStackAddress;
        nextStackAddress += Math.max(1, length * variable.elementSize!);
        const owner = allowDirectLocal && statement.type === "int" && !statement.pointer &&
          !statement.staticStorage && !statement.readOnly && dimensions.length === 1
          ? { vars: current(), name: statement.name, variable } : undefined;
        const scanBufferOwner = allowDirectLocal && statement.type === "char" && !statement.pointer &&
          !statement.staticStorage && !statement.readOnly && dimensions.length === 1
          ? { vars: current(), name: statement.name, variable } : undefined;
        arrayRefs.set(variable.arrayBase, { values: variable.array, type: statement.type, dimensions, owner, scanBufferOwner });
        if (statement.type.startsWith("struct") && !statement.pointer) {
          for (let index = 0; index < length; index++) {
            const address = memory.malloc(16, steps, statement.line);
            heap.set(address, { address, fields: new Map(), type: statement.type });
            variable.array[index] = address;
          }
        }
        if (statement.arrayInitializer) statement.arrayInitializer.forEach((value, index) => {
          if (index < variable.array!.length) variable.array![index] = evaluate(value);
        });
        if (statement.init?.kind === "literal" && typeof statement.init.value === "string") statement.init.value.split("").forEach((character, index) => {
          if (index < variable.array!.length) variable.array![index] = character;
        });
      }
      else if (statement.init) {
        // The declared pointer's type is in scope in its own initializer,
        // for example int **rows = malloc(n * sizeof *rows).
        if (statement.pointer) current().set(statement.name, variable);
        variable.value = evaluate(statement.init);
      }
      // Array declarations already allocated their slots (and, for value arrays,
      // their elements). Do not create a second, unreachable scalar object.
      if (!variable.array && !variable.pointer && statement.type.startsWith("struct")) { const address = memory.malloc(16, steps, statement.line); heap.set(address, { address, fields: new Map(), type: statement.type }); variable.value = address; }
      if (!variable.array && !variable.address) variable.address = nextStackAddress++;
      if (typeof variable.value === "number" && statement.pointer) { const allocation = memory.allocationAt(variable.value); if (allocation) {
        // Remember the structured display separately from runtime stride metadata.
        // A later field alias must not turn an established Node into a raw block.
        const object = heap.get(allocation.address);
        if (object && !object.type && variable.value === allocation.address && statement.type.startsWith("struct")) object.type = statement.type;
        allocation.type = statement.type; allocation.elementSize = variable.elementSize; allocation.elementType = statement.type;
      } }
      current().set(statement.name, variable); record(statement.line); return;
    }
    if (statement.kind === "expr") { evaluate(statement.expr); if (statement.expr.kind !== "call" && statement.expr.kind !== "binary") record(statement.line); return; }
    if (statement.kind === "return") throw new ReturnSignal(statement.value ? evaluate(statement.value) : null);
    if (statement.kind === "if") { if (asNum(evaluate(statement.test))) execute(statement.yes); else if (statement.no) execute(statement.no); return; }
    if (statement.kind === "while" || statement.kind === "do") {
      let guard = 0;
      let firstIteration = true;
      while ((statement.kind === "do" && firstIteration) || asNum(evaluate(statement.test))) {
        firstIteration = false;
        if (++guard > stepLimit) runtimeError("step limit reached", statement.line);
        try { execute(statement.body); }
        catch (caught) {
          if (caught instanceof BreakSignal) break;
          if (!(caught instanceof ContinueSignal)) throw caught;
        }
      }
      return;
    }
    if (statement.kind === "for") { if (statement.init) execute(statement.init); let guard = 0; while (!statement.test || asNum(evaluate(statement.test))) { try { execute(statement.body); } catch (caught) { if (caught instanceof BreakSignal) break; if (!(caught instanceof ContinueSignal)) throw caught; } if (statement.update) evaluate(statement.update); if (++guard > stepLimit) runtimeError("step limit reached", statement.line); } return; }
    if (statement.kind === "break") throw new BreakSignal(statement.line);
    if (statement.kind === "continue") throw new ContinueSignal(statement.line);
    if (statement.kind === "switch") {
      const value = asNum(evaluate(statement.test));
      // Default is a fallback entry point, not a match encountered in source order.
      let start = statement.cases.findIndex(branch => branch.value !== undefined && asNum(evaluate(branch.value)) === value);
      if (start < 0) start = statement.cases.findIndex(branch => branch.value === undefined);
      if (start < 0) return;
      for (const branch of statement.cases.slice(start)) {
        for (const child of branch.body) {
          try { execute(child); }
          catch (caught) { if (caught instanceof BreakSignal) return; throw caught; }
        }
      }
      return;
    }
  };
  try { if (program.body.length) execute({ kind: "block", body: program.body, line: program.body[0].line }); const main = program.functions.get("main"); if (main) { record(main.line, "call"); execute(main.body, true); record(main.line, "return"); } else if (!program.body.length) execute({ kind: "block", body: [], line: 1 }); }
  catch (caught) { if (caught instanceof InputNeeded) return { executionMode: program.functions.has("main") ? "program" : "snippet", trace, status: "waiting", waitingLine: caught.line, leaks: [], orphanedAtExit: [] }; if (caught instanceof MemoryFault) { error = caught; record(caught.line, "error", caught.reason); } else if (!(caught instanceof ReturnSignal) && !(caught instanceof ExitSignal)) { const message = caught instanceof Error || caught instanceof BreakSignal || caught instanceof ContinueSignal ? caught.message : "unsupported construct"; const match = message.match(/line (\d+)/); const line = match ? Number(match[1]) : 1; error = new MemoryFault(message, line, steps); record(line, "error", message); } }
  const roots = [...frames.flatMap(frame => [...frame.vars.values()].map(variable => variable.value))].filter((value): value is number => typeof value === "number");
  const reachable = new Set<number>(); const visit = (address: number) => { const allocation = memory.allocationAt(address); if (!allocation || allocation.freeStep !== undefined || reachable.has(allocation.address)) return; reachable.add(allocation.address); const object = heap.get(allocation.address); if (object) for (const value of object.fields.values()) if (typeof value === "number") visit(value); };
  roots.forEach(visit); const live = memory.allocations.filter(allocation => allocation.freeStep === undefined); const orphanedAtExit = live.filter(allocation => !reachable.has(allocation.address)).map(allocation => allocation.address);
  return { executionMode: program.functions.has("main") ? "program" : "snippet", trace, status: error ? "error" : "ok", error, leaks: (error ? memory.allocations : live).map(allocation => ({ address: allocation.address, line: allocation.line })), orphanedAtExit };
}

