const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const baseline = path.resolve(__dirname, "../../..");
const ts = require(path.join(baseline, "node_modules/typescript"));
require.extensions[".ts"] = (module, filename) => {
  assert.ok(filename.startsWith(path.join(baseline, "src") + path.sep), filename);
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  module._compile(compiled.outputText, filename);
};
const { run } = require(path.join(baseline, "src/vm/interpreter.ts"));
const { InteractiveRun } = require(path.join(baseline, "src/vm/interactive.ts"));
const { renderModel } = require(path.join(baseline, "src/viz/model.ts"));
const { readGraph } = require(path.join(baseline, "src/viz/graph.ts"));

const recordLines = ["Jun 27 C 88.625", "Tara 4 A 88.125", "Milo 16 B 88.875"];
const inputs = {
  interactive: "4\n2.125\n",
  "record-console": recordLines.join("\n") + "\n",
};

const cases = {
  arrays: "-4 -1 0 3 3 8 12 | first 3=3\n",
  "linked-list": "forward=4,16 backward=16,4\n",
  stack: "full=0 pop=5,8,12,7 empty=-1\n",
  "circular-queue": "removed=21,34 full=0 drain=55 89 144 233 empty=-1\n",
  tree: "height=4 sum=83\n",
  graph: "0:0 1:1 2:1 4:2 3:2 5:3 | parent(5)=3\n",
  interactive: "Count?\nWeight?\nWeighted sum: 8.50\n",
  "record-console": "Record 1?\nRecord 2?\nRecord 3?\n4 Tara A 88.125\n16 Milo B 88.875\n27 Jun C 88.625\nBest: Milo\n",
};
const final = result => result.trace.steps.at(-1);
const variables = step => step.frames.find(f => f.name === "main")?.variables ?? {};
const value = (step, label) => variables(step)[label]?.value;
const array = (step, label) => variables(step)[label]?.array;
const cells = (step, label) => array(step, label)?.cells;
const checkpoint = (result, mark) => {
  const found = result.trace.steps.find(s => value(s, "checkpoint") === String(mark));
  assert.ok(found, "Missing checkpoint " + mark);
  return found;
};
const has = (model, field, fromData, toData) => {
  const from = model.nodes.find(n => String(n.value) === String(fromData));
  const to = model.nodes.find(n => String(n.value) === String(toData));
  return Boolean(from && to && model.arrows.some(a => a.from === `0x${from.address.toString(16)}.${field}` && a.to === to.address));
};

function rewind(result, before, after, inspect) {
  assert.ok(before && after && before.index < after.index, "Expected two ordered snapshots");
  for (const step of [after, before, after]) {
    assert.equal(result.trace.goto(step.index), step);
    assert.equal(result.trace.view, step);
    inspect(step, step === before);
  }
  assert.equal(result.trace.goto(-1), result.trace.steps[0]);
  assert.equal(result.trace.goto(Number.MAX_SAFE_INTEGER), final(result));
}

const checks = {
  arrays(result) {
    const first = result.trace.steps.find(s => cells(s, "a")?.[0] === 8);
    rewind(result, first, checkpoint(result, 1), (s, before) => {
      assert.deepEqual(cells(s, "a"), before ? [8,-4,3,3,0,-1,12] : [-4,-1,0,3,3,8,12]);
    });
    assert.ok(result.trace.steps.some(s => value(s, "lo") === "3" && value(s, "hi") === "3"));
  },
  "linked-list"(result) {
    const before = checkpoint(result, 1);
    const after = checkpoint(result, 2);
    rewind(result, before, after, (s, earlier) => {
      const model = renderModel(s);
      assert.equal(model.shape, "doubly-linked-list");
      assert.equal(model.nodes.find(n => n.value === "9").freed, !earlier);
      assert.ok(has(model, "next", 4, earlier ? 9 : 16));
      assert.ok(has(model, "prev", 16, earlier ? 9 : 4));
      assert.equal(s.memory.allocations.filter(a => a.freeStep === undefined).length, earlier ? 3 : 2);
    });
    assert.equal(final(result).memory.allocations.filter(a => a.freeStep !== undefined).length, 3);
  },
  stack(result) {
    rewind(result, checkpoint(result, 1), checkpoint(result, 2), (s, before) => {
      assert.deepEqual(cells(s, "s.data"), [7, 12, before ? 5 : 8]);
      assert.equal(value(s, "s.top"), "2");
    });
    assert.equal(value(final(result), "s.top"), "-1");
  },
  "circular-queue"(result) {
    rewind(result, checkpoint(result, 1), checkpoint(result, 2), (s, before) => {
      assert.equal(value(s, "q.front"), "2");
      assert.equal(value(s, "q.rear"), before ? "3" : "2");
      assert.equal(value(s, "q.count"), before ? "1" : "4");
      const data = cells(s, "q.data");
      const logical = Array.from({ length: Number(value(s, "q.count")) }, (_, i) => data[(2 + i) % 4]);
      assert.deepEqual(logical, before ? [55] : [55,89,144,233]);
    });
    assert.equal(value(final(result), "q.count"), "0");
  },
  tree(result) {
    rewind(result, checkpoint(result, 1), checkpoint(result, 2), (s, before) => {
      const model = renderModel(s);
      assert.equal(model.shape, "tree");
      assert.deepEqual(model.nodes.map(n => Number(n.value)).sort((a, b) => a - b),
        before ? [7,12,17] : [7,8,12,17,19,20]);
      assert.ok(has(model, "llink", 12, 7));
      assert.ok(has(model, "rlink", 12, 17));
      assert.equal(has(model, "rlink", 19, 20), !before);
    });
    assert.ok(Math.max(...result.trace.steps.map(s => s.frames.filter(f => f.name === "height").length)) >= 4);
    assert.equal(final(result).memory.allocations.filter(a => a.freeStep !== undefined).length, 6);
  },
  graph(result) {
    rewind(result, checkpoint(result, 1), checkpoint(result, 2), (s, before) => {
      const graph = readGraph(array(s, "graph"), true);
      assert.equal(graph.size, 6);
      assert.equal(graph.directed, true);
      assert.deepEqual(graph.edges.map(e => [e.from, e.to]), [[0,1],[0,2],[1,4],[2,3],[2,4],[3,0],[3,5],[5,2]]);
      assert.deepEqual(cells(s, "dist"), before ? [0,-1,-1,-1,-1,-1] : [0,1,1,2,2,3]);
      assert.deepEqual(cells(s, "parent"), before ? [-1,-1,-1,-1,-1,-1] : [-1,0,0,2,1,3]);
      assert.deepEqual(cells(s, "q").slice(0, Number(value(s, "rear"))), before ? [0] : [0,1,2,4,3,5]);
    });
  },
  "record-console"(result, code, native) {
    const before = checkpoint(result, 1);
    const after = checkpoint(result, 2);
    const fields = ["name", "seat", "section", "mark"];
    const labels = (i, field) => `scores[${i}].${field}`;
    const addresses = step => [0,1,2].map(i => fields.map(field => {
      const storage = variables(step)[labels(i, field)]?.storage;
      assert.equal(typeof storage, "number");
      return storage;
    }));
    const originalAddresses = addresses(before);
    assert.equal(new Set(originalAddresses.flat()).size, 12);
    const tuple = (step, i) => [
      cells(step, labels(i, "name")).slice(0, 4),
      value(step, labels(i, "seat")),
      value(step, labels(i, "section")),
      value(step, labels(i, "mark")),
    ];
    const jun = [Array.from("Jun\0"), "27", "C", "88.625"];
    const tara = [Array.from("Tara"), "4", "A", "88.125"];
    const milo = [Array.from("Milo"), "16", "B", "88.875"];
    rewind(result, before, after, (s, earlier) => {
      assert.deepEqual(addresses(s), originalAddresses);
      assert.deepEqual([0,1,2].map(i => tuple(s, i)), earlier ? [jun,tara,milo] : [tara,milo,jun]);
    });
    assert.equal(value(final(result), "best"), String(originalAddresses[1][0]));
    const session = new InteractiveRun(code);
    const waiting = [session.result];
    assert.equal(waiting[0].status, "waiting");
    assert.equal(final(waiting[0]).stdout, "Record 1?\n");
    for (const [index, line] of recordLines.entries()) {
      const next = session.submitLine(line);
      if (index < 2) {
        assert.equal(next.status, "waiting");
        assert.equal(final(next).stdout, Array.from({ length: index + 2 }, (_, i) => `Record ${i + 1}?\n`).join(""));
        waiting.push(next);
      } else {
        assert.equal(next.status, "ok", next.error?.reason);
        assert.equal(final(next).stdout, native(inputs["record-console"]));
        for (const [i, expected] of [tara,milo,jun].entries()) {
          assert.deepEqual(tuple(final(next), i), expected);
        }
      }
    }
    assert.equal(session.transcript, inputs["record-console"]);
    assert.equal(final(waiting[0]).stdout, "Record 1?\n");
    assert.equal(final(waiting[1]).stdout, "Record 1?\nRecord 2?\n");
    const early = new InteractiveRun(code);
    assert.equal(early.submitLine(recordLines[0]).status, "waiting");
    const closed = early.sendEOF();
    assert.equal(closed.status, "ok", closed.error?.reason);
    assert.equal(final(closed).stdout, native(recordLines[0] + "\n"));
    assert.equal(final(closed).stdout, "Record 1?\nRecord 2?\nIncomplete record\n");
    const invalid = new InteractiveRun(code);
    const rejected = invalid.submitLine("Jun absent C 88.625");
    assert.equal(rejected.status, "ok", rejected.error?.reason);
    assert.equal(final(rejected).stdout, native("Jun absent C 88.625\n"));
    assert.equal(final(rejected).stdout, "Record 1?\nIncomplete record\n");
  },
  interactive(result, code, native) {
    assert.equal(value(final(result), "weight"), "2.125");
    const session = new InteractiveRun(code);
    assert.equal(session.result.status, "waiting");
    assert.equal(final(session.result).stdout, "Count?\n");
    const initialSnapshot = final(session.result);
    const one = session.submitLine("4");
    assert.equal(one.status, "waiting");
    assert.equal(final(one).stdout, "Count?\nWeight?\n");
    assert.equal(value(final(one), "k"), "4");
    assert.equal(value(final(one), "weight"), "-1");
    const two = session.submitLine("2.125");
    assert.equal(two.status, "ok");
    assert.equal(final(two).stdout, native("4\n2.125\n"));
    assert.equal(session.transcript, "4\n2.125\n");
    assert.equal(initialSnapshot.stdout, "Count?\n");
    assert.equal(final(one).stdout, "Count?\nWeight?\n");
    const beforeWeight = two.trace.steps.find(s => s.stdout === "Count?\nWeight?\n" && value(s, "weight") === "-1");
    rewind(two, beforeWeight, final(two), (s, before) => {
      assert.equal(value(s, "weight"), before ? "-1" : "2.125");
      assert.equal(s.stdout, before ? "Count?\nWeight?\n" : cases.interactive);
    });
    const eof = new InteractiveRun(code);
    assert.equal(eof.submitLine("4").status, "waiting");
    const closed = eof.sendEOF();
    assert.equal(closed.status, "ok");
    assert.equal(final(closed).stdout, native("4\n"));
    assert.equal(final(closed).stdout, "Count?\nWeight?\nNo weight\n");
    assert.throws(() => eof.submitLine("2.125"), /not waiting/);
    const invalid = new InteractiveRun(code);
    const rejected = invalid.submitLine("hello");
    assert.equal(rejected.status, "ok");
    assert.equal(final(rejected).stdout, native("hello\n"));
    assert.equal(final(rejected).stdout, "Count?\nNo count\n");
  },
};

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "memlens-launch-corpus-"));
try {
  let failures = 0;
  for (const [name, expected] of Object.entries(cases)) {
    const file = path.join(__dirname, "fixtures", name + ".c");
    const code = fs.readFileSync(file, "utf8");
    const stdin = inputs[name] ?? "";
    const bin = path.join(temp, name);
    execFileSync("gcc", ["-std=c17", "-Wall", "-Wextra", "-Werror", "-pedantic", "-fsanitize=undefined", "-fno-sanitize-recover=undefined", file, "-o", bin], { timeout: 10000 });
    const native = input => execFileSync(bin, { encoding: "utf8", input, timeout: 3000 });
    assert.equal(native(stdin), expected, name + " GCC output");
    const result = run(code, 100000, 100, stdin);
    try {
      assert.equal(result.status, "ok", result.error?.reason);
      assert.equal(final(result).stdout, expected, name + " Memlens output");
      assert.equal(result.leaks.length, 0, name + " Memlens leaks");
      assert.ok(result.trace.steps.every((step, index) => step.index === index && step.line >= 1 && step.line <= code.split("\n").length));
      checks[name](result, code, native);
      console.log(`PASS ${name} ${result.trace.steps.length} steps ${JSON.stringify(expected)}`);
    } catch (e) {
      failures++;
      console.error(`FAIL ${name}: ${e.stack ?? e}`);
    }
  }
  process.exitCode = failures ? 1 : 0;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
