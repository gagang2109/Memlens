import { expect, it } from "vitest";
import { run } from "./interpreter";
it("preserves string pointer provenance without changing existing numeric/null snapshots", () => {
  const result = run('int main(){char *s="4096";char *p=malloc(4);char *n=NULL;}');
  expect(result.status).toBe("ok");
  const vars = result.trace.steps.at(-1)!.frames[0].variables!;
  expect(vars.s).toEqual({type:"char *", value:"4096", pointer:true, stringPointer:true});
  expect(vars.p).toEqual({type:"char *", value:"4096", pointer:true});
  expect(vars.n).toEqual({type:"char *", value:"null", pointer:true});
});
it("recomputes presentation provenance on reassignment and preserves previous snapshots", () => {
  const result = run('int main(){char *s="123";s=malloc(4);}');
  expect(result.status).toBe("ok");
  const values = result.trace.steps.flatMap(step => step.frames.flatMap(frame => frame.variables?.s ? [frame.variables.s] : []));
  expect(values.some(value => value.value === "123" && value.stringPointer)).toBe(true);
  expect(values.at(-1)?.stringPointer).toBeUndefined();
  expect(values.at(-1)?.value).toBe("4096");
});
