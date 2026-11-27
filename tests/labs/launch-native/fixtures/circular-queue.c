#include <stdio.h>
typedef struct Queue { int data[4]; int front, rear, count; } Queue;
int push(Queue *q, int value) {
  if (q->count == 4) return 0;
  q->data[q->rear] = value;
  q->rear = (q->rear + 1) % 4;
  q->count++;
  return 1;
}
int pop(Queue *q) {
  if (q->count == 0) return -1;
  int x = q->data[q->front];
  q->front = (q->front + 1) % 4;
  q->count--;
  return x;
}
int main(void) {
  Queue q;
  q.front=0; q.rear=0; q.count=0;
  push(&q, 21); push(&q, 34); push(&q, 55);
  int a = pop(&q), b = pop(&q);
  int checkpoint = 1;
  push(&q, 89); push(&q, 144); push(&q, 233);
  checkpoint = 2;
  int full = push(&q, 377);
  printf("removed=%d,%d full=%d drain=", a, b, full);
  while (q.count > 0) printf("%d ", pop(&q));
  printf("empty=%d\n", pop(&q));
  return checkpoint - 2;
}
