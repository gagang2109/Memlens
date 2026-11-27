import { expect, it } from "vitest";
import { run } from "./interpreter";

const record = "struct Row { char grade; char name[4]; int id; float marks; };";
it("reads a letter grade through a helper, transfers it with the record and preserves old snapshots", () => {
  const result = run(record + `
    void load(struct Row a[]) {
      for (int i=0;i<2;i++) scanf("%3s %d %c %f", a[i].name,&a[i].id,&a[i].grade,&a[i].marks);
    }
    int main(void) {
      struct Row a[2]; load(a);
      struct Row temporary = a[0]; a[0]=a[1]; a[1]=temporary;
      struct Row *best = &a[0];
      printf("%s %c %.2f %zu %zu",best->name,best->grade,best->marks,sizeof best->grade,sizeof a[0]);
      return 0;
    }`,100000,100,"Ari 21 A 88.125 Bo 12 B 88.875");
  expect(result.error).toBeUndefined();
  expect(result.trace.steps.at(-1)?.stdout).toBe("Bo B 88.88 1 16");
  const earlier = result.trace.steps.find(step => step.frames.some(frame => frame.variables?.["a[0].grade"]?.value === "A"));
  const later = result.trace.steps.find(step => step.frames.some(frame => frame.variables?.["a[0].grade"]?.value === "B"));
  expect(earlier).toBeDefined(); expect(later).toBeDefined();
  expect(later!.index).toBeGreaterThan(earlier!.index);
  const gradeAt = (index: number) => result.trace.goto(index)?.frames.find(frame=>frame.name==="main")?.variables?.["a[0].grade"];
  const previous = gradeAt(earlier!.index), next = gradeAt(later!.index);
  expect(previous?.value).toBe("A"); expect(next?.value).toBe("B");
  expect(previous?.storage).toBe(next?.storage);
});

it.each([["%2c","AB"],["%s","AB"],["%d","4"],["%f","0.5"]])("rejects a wrong scanner for one-byte grade: %s", (fmt,input) => {
  const result=run(record+`\nint main(void){struct Row row; scanf("${fmt}",&row.grade); return 0;}`,100000,100,input);
  expect(result.error?.reason).toContain("scalar char record field takes scanf %c with width one");
});

it("keeps a scalar char separate from the following member and rejects uninitialized reads", () => {
  const failure=run(record+'\nint main(void){struct Row row; printf("%c",row.grade);return 0;}');
  expect(failure.error?.reason).toContain("uninitialized read of 'grade'");
  const result=run(record+'\nint main(void){struct Row row; row.grade=65; row.name[0]=66; row.name[1]=0; printf("%c:%s",row.grade,row.name);return 0;}');
  expect(result.error).toBeUndefined();
  expect(result.trace.steps.at(-1)?.stdout).toBe("A:B");
});
