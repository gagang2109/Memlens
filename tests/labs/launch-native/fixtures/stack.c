#include <stdio.h>
typedef struct Stack { int data[3]; int top; } Stack;
int push(Stack *s, int value) {
  if (s->top == 2) return 0;
  s->top++;
  s->data[s->top] = value;
  return 1;
}
int pop(Stack *s) {
  if (s->top < 0) return -1;
  int value = s->data[s->top];
  s->top--;
  return value;
}
int main(void) {
  Stack s;
  s.top = -1;
  push(&s, 7); push(&s, 12); push(&s, 5);
  int checkpoint = 1;
  int full = push(&s, 99);
  int a = pop(&s);
  push(&s, 8);
  checkpoint = 2;
  int b = pop(&s), c = pop(&s), d = pop(&s), e = pop(&s);
  printf("full=%d pop=%d,%d,%d,%d empty=%d\n", full, a, b, c, d, e);
  return checkpoint - 2;
}
