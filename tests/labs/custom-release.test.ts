import { describe, expect, it } from "vitest";
import { run } from "../../src/vm/interpreter";

export const customCases = [
  { name: "bounded stack overflow, LIFO pop and underflow", expected: "full 30 20 10 empty", code: `int main() {
    int stack[3]; int top = -1; int i;
    for(i=1;i<=4;i++) { if(top==2) printf("full "); else stack[++top]=i*10; }
    while(top>=0) printf("%d ",stack[top--]);
    if(top<0) printf("empty");
  }` },
  { name: "circular queue wraparound and full/empty guards", expected: "full 1 2 3 4 5 empty", code: `int main() {
    int q[3]; int front=0; int rear=0; int count=0; int i;
    for(i=1;i<=4;i++) { if(count==3) printf("full "); else {q[rear]=i;rear=(rear+1)%3;count++;} }
    for(i=0;i<2;i++){printf("%d ",q[front]);front=(front+1)%3;count--;}
    for(i=4;i<=5;i++){q[rear]=i;rear=(rear+1)%3;count++;}
    while(count>0){printf("%d ",q[front]);front=(front+1)%3;count--;}
    printf("empty");
  }` },
  { name: "linked list delete head, reverse and free every node", expected: "1 2 ", code: `typedef struct Node {int value; struct Node *next;} Node;
    Node *push(Node *head,int value){Node *p=malloc(sizeof(Node));p->value=value;p->next=head;return p;}
    int main(){Node *head=NULL;head=push(head,1);head=push(head,2);head=push(head,3);
      Node *dead=head;head=head->next;free(dead);
      Node *prev=NULL;while(head){Node *next=head->next;head->next=prev;prev=head;head=next;}
      while(prev){printf("%d ",prev->value);Node *next=prev->next;free(prev);prev=next;}
    }` },
  { name: "BST duplicate rejection, inorder and recursive cleanup", expected: "1 2 3 ", code: `typedef struct Node {int value;struct Node *left;struct Node *right;} Node;
    Node *insert(Node *r,int v){if(r==NULL){r=malloc(sizeof(Node));r->value=v;r->left=NULL;r->right=NULL;}
      else if(v<r->value) r->left=insert(r->left,v);else if(v>r->value) r->right=insert(r->right,v);return r;}
    void visit(Node *r){if(r==NULL)return;visit(r->left);printf("%d ",r->value);visit(r->right);}
    void cleanup(Node *r){if(r==NULL)return;cleanup(r->left);cleanup(r->right);free(r);}
    int main(){Node *r=NULL;r=insert(r,2);r=insert(r,1);r=insert(r,3);r=insert(r,2);visit(r);cleanup(r);}` },
  { name: "matrix traversal plus pointer parameter swap", expected: "21 9 4", code: `void swap(int *a,int *b){int t=*a;*a=*b;*b=t;}
    int main(){int grid[2][3]={{1,2,3},{4,5,6}};int sum=0;int i;int j;
      for(i=0;i<2;i++)for(j=0;j<3;j++)sum+=grid[i][j];
      int a=4;int b=9;swap(&a,&b);printf("%d %d %d",sum,a,b);}` },
] as const;

describe("custom realistic release scenarios", () => {
  it.each(customCases)("$name", ({code,expected}) => {
    const result=run(code);
    expect(result.status,result.error?.reason).toBe("ok");
    expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
    expect(result.leaks).toHaveLength(0);
  });
  it.each([
    ["double free", "int *p=malloc(sizeof(int));free(p);free(p);"],
    ["null pointer dereference", "int *p=NULL;printf(\"%d\",*p);"],
    ["uninitialized read", "int *p=malloc(sizeof(int));printf(\"%d\",p[0]);"],
    ["use-after-free", "int *p=malloc(sizeof(int));p[0]=7;free(p);printf(\"%d\",p[0]);"],
    ["array index out of bounds (3)", "int a[3]={1,2,3};printf(\"%d\",a[3]);"],
  ])("reports %s", (reason,body) => {
    const result=run(`int main(){${body}}`);
    expect(result.status).toBe("error");expect(result.error?.reason).toBe(reason);
  });
});
