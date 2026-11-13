import { parse, type Expr, type FunctionDef, type Program, type Stmt } from "../lang/parser";
import { Memory, MemoryFault } from "./memory";
import { Trace, type FrameView } from "./trace";

type Value = number | string | null;
type RuntimeVariable = { value: Value; type: string; pointer: boolean; array?: Value[]; dimensions?: number[]; elementSize?: number; arrayBase?: number; address?: number };
type Ref = { get: () => Value; set: (value: Value) => void; address?: number };
type HeapObject = { address: number; fields: Map<string, Value>; type?: string };
type FlowSignal = "break" | "continue";

export type RunResult = { trace: Trace; status: "ok" | "error"; error?: MemoryFault; leaks: { address: number; line: number }[]; orphanedAtExit: number[] };

const elementSize = (type: string) => type.includes("char") ? 1 : type.startsWith("struct") ? 16 : 4;

export function run(source: string, stepLimit = 100000, recursionLimit = 100, stdin = ""): RunResult {
  const trace = new Trace();
  let program: Program;
  try { program = parse(source); } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unsupported construct";
    const match = message.match(/line (\d+)/); const line = match ? Number(match[1]) : 1;
    const error = new MemoryFault(`parse error: ${message}`, line, 0);
    trace.add({ line, stdout: "", memory: { bytes: [], shadows: [], allocations: [] }, frames: [], event: "error", message: error.reason });
    return { trace, status: "error", error, leaks: [], orphanedAtExit: [] };
  }
  const memory = new Memory(); const heap = new Map<number, HeapObject>(); const cells = new Map<number, Value>();
  const arrayRefs = new Map<number, { values: Value[]; type: string }>(); const locations = new Map<number, Ref>(); let nextStackAddress = 0x7000;
  const frames: { name: string; vars: Map<string, RuntimeVariable> }[] = [{ name: "main", vars: new Map() }];
  let stdout = ""; let stdinCursor = 0; let steps = 0; let error: MemoryFault | undefined;
  const current = () => frames[frames.length - 1].vars;
  // Character values use one-character strings in the existing VM representation.
  // Promote these to basic execution-character codes, including digits and NUL.
  const asNum = (value: Value) => typeof value === "number" ? value : value === null ? 0 : value.length === 1 ? value.charCodeAt(0) : Number(value);
  const findVariable = (name: string) => [...frames].reverse().map(frame => frame.vars.get(name)).find(Boolean);
  const pointerMeta = (expression: Expr) => expression.kind === "name" ? findVariable(expression.name) : undefined;
  const record = (line: number, event: "step" | "alloc" | "free" | "error" | "call" | "return" = "step", message?: string) => {
    const visible: FrameView[] = frames.map(frame => ({
      name: frame.name,
      locals: Object.fromEntries([...frame.vars].map(([key, variable]) => [key, variable.array ? `[${variable.array.join(", ")}]` : String(variable.value)])),
      variables: Object.fromEntries([...frame.vars].map(([key, variable]) => [key, { type: `${variable.type}${variable.pointer ? " *" : ""}`, value: variable.array ? `[${variable.array.join(", ")}]` : String(variable.value), pointer: variable.pointer, ...(variable.pointer && !variable.array && typeof variable.value === "string" ? { stringPointer: true } : {}) }])),
    }));
    const pointers = frames.flatMap(frame => [...frame.vars].flatMap(([name, variable]) => variable.pointer && typeof variable.value === "number" ? [{ from: `${frame.name}.${name}`, to: variable.value, label: name, dangling: Boolean(memory.allocations.find(a => a.address === variable.value)?.freeStep !== undefined) }] : []));
    for (const object of heap.values()) for (const [label, value] of object.fields) if (["next", "left", "right"].includes(label) && typeof value === "number") pointers.push({ from: `0x${object.address.toString(16)}.${label}`, to: value, label, dangling: Boolean(memory.allocations.find(a => a.address === value)?.freeStep !== undefined) });
    trace.add({ line, stdout, memory: memory.snapshot(), frames: visible, heap: [...heap.values()].map(object => ({ address: object.address, type: object.type, fields: Object.fromEntries([...object.fields].map(([key, value]) => [key, String(value)])) })), pointers, event, message });
    steps++;
  };
  const runtimeError = (reason: string, line: number, allocation?: ReturnType<Memory["find"]>): never => { throw new MemoryFault(reason, line, steps, allocation); };
  const addressFor = (expression: Expr, line: number) => {
    const value = asNum(evaluate(expression)); const allocation = memory.find(value);
    if (allocation?.freeStep !== undefined) runtimeError("use-after-free", line, allocation);
    const array = arrayRefs.get(value); if (array) return { value, array };
    if (value === 0) runtimeError("null pointer dereference", line);
    if (!allocation) runtimeError("invalid pointer dereference", line);
    return { value };
  };
  const ref = (expression: Expr, addressOnly = false): Ref => {
    if (expression.kind === "name") {
      const variable = findVariable(expression.name); if (!variable) throw new Error(`line ${expression.line}: unknown variable ${expression.name}`);
      if (variable.array) return { get: () => variable.array![0], set: () => runtimeError("array is not assignable", expression.line), address: variable.arrayBase };
      if (!variable.address) variable.address = nextStackAddress++;
      const result = { get: () => variable.value, set: (value: Value) => { variable.value = value; }, address: variable.address };
      locations.set(variable.address, result); return result;
    }
    if (expression.kind === "member") {
      const object = evaluate(expression.object); const allocation = memory.find(asNum(object));
      if (!allocation) runtimeError(asNum(object) === 0 ? "null pointer dereference" : "invalid pointer dereference", expression.line);
      if (allocation!.freeStep !== undefined) runtimeError("use-after-free", expression.line, allocation);
      const block = heap.get(asNum(object)); if (!block) runtimeError("invalid pointer dereference", expression.line);
      const fieldIndex = ["data", "value", "key", "left", "right", "next", "prev"].indexOf(expression.name);
      const address = block!.address + (fieldIndex < 0 ? block!.fields.size : fieldIndex) * 4;
      const result = { get: () => block!.fields.get(expression.name) ?? null, set: (value: Value) => block!.fields.set(expression.name, value), address };
      locations.set(address, result);
      return result;
    }
    if (expression.kind === "index") {
      const index = asNum(evaluate(expression.index));
      if (expression.object.kind === "index" && expression.object.object.kind === "name") {
        const outerVariable = findVariable(expression.object.object.name);
        if (outerVariable?.array && outerVariable.dimensions?.length) {
          // Resolve the row once: evaluating the inner index expression first
          // would repeat side effects such as matrix[row++][column].
          const outer = asNum(evaluate(expression.object.index)); const width = outerVariable.dimensions[1] ?? 1; const flat = outer * width + index;
          // Validate both dimensions before flattening: an invalid column can
          // otherwise spill into the next row and appear to be in bounds.
          // Address formation alone may point one past the row; no read/write.
          if (!Number.isInteger(outer) || outer < 0 || outer >= outerVariable.dimensions[0]) runtimeError(`array index out of bounds (${outer})`, expression.line);
          if (!Number.isInteger(index) || index < 0 || index > width || (!addressOnly && (index === width || flat >= outerVariable.array.length))) runtimeError(`array index out of bounds (${index})`, expression.line);
          return { get: () => outerVariable.array![flat], set: value => { outerVariable.array![flat] = value; }, address: (outerVariable.arrayBase ?? 0) + flat * (outerVariable.elementSize ?? 4) };
        }
      }
      const base = asNum(evaluate(expression.object));
      const variable = pointerMeta(expression.object); const array = expression.object.kind === "name" ? findVariable(expression.object.name)?.array : undefined;
      if (array) { if (!Number.isInteger(index) || index < 0 || index >= array.length) runtimeError(`array index out of bounds (${index})`, expression.line); return { get: () => array[index], set: value => { array[index] = value; }, address: (findVariable(expression.object.kind === "name" ? expression.object.name : "")?.arrayBase ?? 0) + index * (variable?.elementSize ?? 4) }; }
      const baseArray = arrayRefs.get(base); if (baseArray) { if (!Number.isInteger(index) || index < 0 || index >= baseArray.values.length) runtimeError(`pointer index out of bounds (${index})`, expression.line); return { get: () => baseArray.values[index], set: value => { baseArray.values[index] = value; }, address: base + index * (variable?.elementSize ?? elementSize(baseArray.type)) }; }
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
      const address = asNum(evaluate(expression.expr)); const allocation = memory.find(address);
      if (locations.has(address)) return locations.get(address)!;
      if (!allocation) runtimeError(address === 0 ? "null pointer dereference" : "invalid pointer dereference", expression.line);
      if (allocation!.freeStep !== undefined) runtimeError("use-after-free", expression.line, allocation);
      return { get: () => cells.get(address) ?? memory.read(address, steps, expression.line), set: value => { cells.set(address, value); memory.write(address, asNum(value), steps, expression.line); }, address };
    }
    throw new Error(`line ${expression.line}: expression is not assignable (${expression.kind})`);
  };
  const readString = (value: Value) => {
    if (typeof value === "string") return value.split("\0", 1)[0];
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
    if (typeof value === "number") { let result = ""; for (let index = 0; index < 256; index++) { const cell = cells.get(value + index); if (cell === undefined || cell === 0 || cell === "\0") break; result += typeof cell === "number" ? String.fromCharCode(cell & 255) : String(cell); } return result; }
    return "";
  };
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
      if (expression.name === "sizeof") {
        const argument = args[0];
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
      if (expression.name === "strlen") return readString(evaluate(args[0])).length;
      if (expression.name === "strcpy" || expression.name === "strcat") { const destination = asNum(evaluate(args[0])); const source = readString(evaluate(args[1])); const existing = expression.name === "strcat" ? readString(destination) : ""; const result = existing + source;
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
        const left = encoder.encode(readString(evaluate(args[0])).split("\0", 1)[0]);
        const right = encoder.encode(readString(evaluate(args[1])).split("\0", 1)[0]);
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
        const format = readString(evaluate(args[0])).split("\0", 1)[0];
        // Evaluate every destination once, before scanning, as with ordinary calls.
        const destinations = args.slice(1).map(argument => asNum(evaluate(argument)));
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
          if (/\s/.test(format[i])) { while (/\s/.test(stdin[stdinCursor] ?? "") && stdinCursor < stdin.length) stdinCursor++; continue; }
          if (format[i] !== "%" || format[i + 1] === "%") {
            const literal = format[i] === "%" ? format[++i] : format[i];
            if (stdinCursor >= stdin.length) { inputFailure = true; break; }
            if (stdin[stdinCursor] !== literal) break;
            stdinCursor++; continue;
          }
          const conversion = format.slice(i).match(/^%(\*)?(\d*)([dcs])/);
          if (!conversion) runtimeError("unsupported scanf conversion", expression.line);
          const [, suppressed, widthText, specifier] = conversion!;
          i += conversion![0].length - 1;
          const width = widthText ? Number(widthText) : specifier === "c" ? 1 : Infinity;
          if (width < 1) runtimeError("invalid scanf field width", expression.line);
          if (specifier !== "c") while (stdinCursor < stdin.length && /\s/.test(stdin[stdinCursor])) stdinCursor++;
          if (stdinCursor >= stdin.length) { inputFailure = true; break; }
          const remaining = stdin.slice(stdinCursor, Number.isFinite(width) ? stdinCursor + width : undefined);
          const token = specifier === "d" ? remaining.match(/^[+-]?\d+/)?.[0] : specifier === "s" ? remaining.match(/^\S+/)?.[0] : remaining;
          if (!token) {
            // A sign is a valid prefix of a decimal input item, even if no digit follows.
            if (specifier === "d" && /^[+-]/.test(remaining)) stdinCursor++;
            break;
          }
          stdinCursor += token.length;
          if (suppressed) continue;
          const destination = destinations[destinationIndex++];
          if (destination === undefined) runtimeError("missing scanf destination", expression.line);
          if (specifier === "d") write(destination, Number(token));
          else {
            for (let offset = 0; offset < token.length; offset++) write(destination + offset, token[offset]);
            if (specifier === "s") write(destination + token.length, "\0");
          }
          assigned++;
        }
        record(expression.line);
        return inputFailure && assigned === 0 ? -1 : assigned;
      }
      if (expression.name === "getchar") {
        if (stdinCursor >= stdin.length) { record(expression.line); return -1; }
        const character = stdin[stdinCursor];
        stdinCursor++; record(expression.line); return character;
      }
      if (expression.name === "exit") { record(expression.line); throw new ExitSignal(); }
      if (expression.name === "printf") {
        const format = readString(evaluate(args[0])).split("\0", 1)[0];
        const values = args.slice(1).map(argument => evaluate(argument)); let index = 0; let characterByteAdjustment = 0;
        const output = format.replace(/%([-+ 0]*)([0-9]*)(?:\.([0-9]*))?(lf|[dcspf%])|%/g,
          (_match, flags: string, widthText: string, precisionText: string | undefined, specifier: string) => {
            if (_match === "%") runtimeError("unsupported or incomplete printf conversion", expression.line);
            if (specifier === "%") return "%";
            const value = values[index++]; const width = Number(widthText || 0);
            const precision = precisionText === undefined ? undefined : Number(precisionText || 0);
            // Bound formatting allocations just as execution and memory are bounded.
            if (width > 10000 || (precision !== undefined && precision > 10000))
              runtimeError("printf width or precision exceeds simulator limit (10000)", expression.line);
            let text: string; let sign = "";
            if (specifier === "s") {
              text = readString(value).split("\0", 1)[0]; if (precision !== undefined) text = text.slice(0, precision);
            } else if (specifier === "c") {
              text = String.fromCharCode(asNum(value) & 255);
              characterByteAdjustment += 1 - new TextEncoder().encode(text).length;
            }
            else if (specifier === "d" || specifier === "f" || specifier === "lf") {
              const number = specifier === "d" ? Math.trunc(asNum(value)) : asNum(value);
              sign = number < 0 || (specifier !== "d" && Object.is(number, -0)) ? "-" : flags.includes("+") ? "+" : flags.includes(" ") ? " " : "";
              if (specifier === "d") {
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
            if (flags.includes("0") && (specifier === "d" ? precision === undefined : specifier === "f" || specifier === "lf"))
              return sign + "0".repeat(padding) + text;
            return " ".repeat(padding) + sign + text;
          });
        stdout += output; record(expression.line);
        return new TextEncoder().encode(output).length + characterByteAdjustment;
      }
      const fn = program.functions.get(expression.name); if (!fn) throw new Error(`line ${expression.line}: unsupported function '${expression.name}'`);
      if (frames.length >= recursionLimit) runtimeError("stack overflow", expression.line);
      const values = args.map(argument => evaluate(argument)); frames.push({ name: fn.name, vars: new Map(fn.params.map((parameter, index) => [parameter.name, { value: values[index] ?? null, type: parameter.type, pointer: parameter.pointer, elementSize: elementSize(parameter.type) }])) }); record(expression.line, "call");
      let returned: Value = null; try { execute(fn.body); } catch (caught) { if (caught instanceof ReturnSignal) returned = caught.value; else throw caught; } finally { frames.pop(); record(expression.line, "return"); } return returned;
    }
    if (expression.kind === "binary") {
      if (["=", "+=", "-="].includes(expression.op)) { const reference = ref(expression.left); const right = evaluate(expression.right); const old = expression.op === "=" ? 0 : asNum(reference.get()); const pointer = pointerMeta(expression.left); const delta = pointer?.pointer ? (pointer.elementSize ?? 1) : 1; const value = expression.op === "=" ? right : old + (expression.op === "+=" ? asNum(right) * delta : -asNum(right) * delta); reference.set(value); record(expression.line); return value; }
      if (expression.op === ",") { evaluate(expression.left); return evaluate(expression.right); }
      // C logical operators evaluate the right operand only when needed.
      if (expression.op === "&&") return asNum(evaluate(expression.left)) ? (asNum(evaluate(expression.right)) ? 1 : 0) : 0;
      if (expression.op === "||") return asNum(evaluate(expression.left)) ? 1 : (asNum(evaluate(expression.right)) ? 1 : 0);
      const left = evaluate(expression.left); const right = evaluate(expression.right); const a = asNum(left); const b = asNum(right); if (["+", "-"].includes(expression.op)) { const pointer = pointerMeta(expression.left); if (pointer?.pointer) return a + (expression.op === "+" ? b : -b) * (pointer.elementSize ?? 1); }
      if (expression.op === "/" && b === 0) runtimeError("division by zero", expression.line);
      if (expression.op === "%" && b === 0) runtimeError("remainder by zero", expression.line);
      if (expression.op === "==" || expression.op === "!=") { const equal = typeof left === "string" || typeof right === "string" ? left === right : a === b; return expression.op === "==" ? (equal ? 1 : 0) : (equal ? 0 : 1); }
      return ({ "+": a + b, "-": a - b, "*": a * b, "/": Math.trunc(a / b), "%": a % b, "<": a < b ? 1 : 0, ">": a > b ? 1 : 0, "<=": a <= b ? 1 : 0, ">=": a >= b ? 1 : 0 } as Record<string, number>)[expression.op] ?? 0;
    }
    return null;
  };
  const allocate = (size: number, line: number) => { const address = memory.malloc(size, steps, line); heap.set(address, { address, fields: new Map() }); record(line, "alloc"); return address; };
  class ReturnSignal { constructor(public value: Value) {} }
  class ExitSignal {}
  class BreakSignal {} class ContinueSignal {}
  const execute = (statement: Stmt): void => {
    if (steps >= stepLimit) runtimeError("step limit reached", statement.line);
    if (statement.kind === "block") { for (const child of statement.body) execute(child); return; }
    if (statement.kind === "decl") {
      const variable: RuntimeVariable = { value: null, type: statement.type, pointer: statement.pointer, elementSize: elementSize(statement.type) };
      if (statement.arrayLength) { const dimensions = (statement.arrayLengths ?? [statement.arrayLength]).map(lengthExpr => asNum(evaluate(lengthExpr)) || 1); const length = dimensions.reduce((total, dimension) => total * dimension, 1); if (length < 0) runtimeError("negative array size", statement.line); variable.dimensions = dimensions; variable.array = Array.from({ length }, () => statement.type.includes("char") ? "\0" : 0); variable.pointer = false; variable.arrayBase = nextStackAddress; nextStackAddress += Math.max(1, length * variable.elementSize!); arrayRefs.set(variable.arrayBase, { values: variable.array, type: statement.type }); if (statement.type.startsWith("struct") && !statement.pointer) for (let index = 0; index < length; index++) { const address = memory.malloc(16, steps, statement.line); heap.set(address, { address, fields: new Map(), type: statement.type }); variable.array[index] = address; } if (statement.arrayInitializer) statement.arrayInitializer.forEach((value, index) => { if (index < variable.array!.length) variable.array![index] = evaluate(value); }); if (statement.init?.kind === "literal" && typeof statement.init.value === "string") statement.init.value.split("").forEach((character, index) => { if (index < variable.array!.length) variable.array![index] = character; }); }
      else if (statement.init) variable.value = evaluate(statement.init);
      if (!variable.pointer && statement.type.startsWith("struct")) { const address = memory.malloc(16, steps, statement.line); heap.set(address, { address, fields: new Map(), type: statement.type }); variable.value = address; }
      if (!variable.array && !variable.address) variable.address = nextStackAddress++;
      if (typeof variable.value === "number" && statement.pointer) { const allocation = memory.allocationAt(variable.value); if (allocation) { allocation.type = statement.type; allocation.elementSize = variable.elementSize; allocation.elementType = statement.type; } }
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
    if (statement.kind === "break") throw new BreakSignal();
    if (statement.kind === "continue") throw new ContinueSignal();
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
  try { if (program.body.length) execute({ kind: "block", body: program.body, line: program.body[0].line }); const main = program.functions.get("main"); if (main) { record(main.line, "call"); execute(main.body); record(main.line, "return"); } else if (!program.body.length) execute({ kind: "block", body: [], line: 1 }); }
  catch (caught) { if (caught instanceof MemoryFault) { error = caught; record(caught.line, "error", caught.reason); } else if (!(caught instanceof ReturnSignal) && !(caught instanceof ExitSignal)) { const message = caught instanceof Error ? caught.message : "unsupported construct"; const match = message.match(/line (\d+)/); const line = match ? Number(match[1]) : 1; error = new MemoryFault(message, line, steps); record(line, "error", message); } }
  const roots = [...frames.flatMap(frame => [...frame.vars.values()].map(variable => variable.value))].filter((value): value is number => typeof value === "number");
  const reachable = new Set<number>(); const visit = (address: number) => { if (reachable.has(address)) return; const allocation = memory.allocationAt(address); if (!allocation || allocation.freeStep !== undefined) return; reachable.add(allocation.address); const object = heap.get(allocation.address); if (object) for (const value of object.fields.values()) if (typeof value === "number") visit(value); };
  roots.forEach(visit); const live = memory.allocations.filter(allocation => allocation.freeStep === undefined); const orphanedAtExit = live.filter(allocation => !reachable.has(allocation.address)).map(allocation => allocation.address);
  return { trace, status: error ? "error" : "ok", error, leaks: (error ? memory.allocations : live).map(allocation => ({ address: allocation.address, line: allocation.line })), orphanedAtExit };
}

