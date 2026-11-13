import { describe, expect, it } from "vitest";
import { run } from "./interpreter";

// Expected stdout independently checked with native cc and UndefinedBehaviorSanitizer.
// These examples use explicit array lengths and only defined C operations.
function expectOutput(source: string, expected: string) {
  const result = run(source);
  expect(result.status, result.error?.reason).toBe("ok");
  expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
}

describe("real-world data-structure lab regressions", () => {
  it("sorts duplicates and negative values using recursive quicksort", () => {
    expectOutput(`#include <stdio.h>
void quick(int a[],int lo,int hi){
 if(lo>=hi)return;
 int i=lo,j=hi,p=a[(lo+hi)/2];
 while(i<=j){
 while(a[i]<p)i++;
 while(a[j]>p)j--;
 if(i<=j){int t=a[i];a[i]=a[j];a[j]=t;i++;j--;}
 }
 if(lo<j)quick(a,lo,j);
 if(i<hi)quick(a,i,hi);
}
int main(){int a[8]={5,-1,5,3,0,-9,8,2};quick(a,0,7);for(int i=0;i<8;i++)printf("%d ",a[i]);return 0;}
`, "-9 -1 0 2 3 5 5 8 ");
  });
  it("preserves FIFO order after a circular queue wraps around", () => {
    expectOutput(`#include <stdio.h>
int main(){int q[4];int front=0,rear=0,count=0;for(int i=1;i<=4;i++){q[rear]=i;rear=(rear+1)%4;count++;}for(int i=0;i<2;i++){printf("%d ",q[front]);front=(front+1)%4;count--;}for(int i=5;i<=6;i++){q[rear]=i;rear=(rear+1)%4;count++;}while(count>0){printf("%d ",q[front]);front=(front+1)%4;count--;}return 0;}
`, "1 2 3 4 5 6 ");
  });
  it("sorts an array using iterative heap repair", () => {
    expectOutput(`#include <stdio.h>
void down(int a[],int n,int i){
while(1){int largest=i,l=2*i+1,r=2*i+2;if(l<n&&a[l]>a[largest])largest=l;if(r<n&&a[r]>a[largest])largest=r;if(largest==i)break;int t=a[i];a[i]=a[largest];a[largest]=t;i=largest;}}
int main(){int a[6]={4,10,3,5,1,8};for(int i=2;i>=0;i--)down(a,6,i);for(int end=5;end>0;end--){int t=a[0];a[0]=a[end];a[end]=t;down(a,end,0);}for(int i=0;i<6;i++)printf("%d ",a[i]);return 0;}
`, "1 3 4 5 8 10 ");
  });
});
