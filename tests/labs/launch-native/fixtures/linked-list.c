#include <stdio.h>
#include <stdlib.h>
typedef struct Node { int data; struct Node *next, *prev; } Node;
Node *make(int x) {
  Node *p = malloc(sizeof(Node));
  p->data = x; p->next = NULL; p->prev = NULL;
  return p;
}
int main(void) {
  Node *head = make(4), *mid = make(9), *tail = make(16);
  head->next = mid; mid->prev = head;
  mid->next = tail; tail->prev = mid;
  int checkpoint = 1;
  head->next = mid->next; tail->prev = mid->prev;
  free(mid); mid = NULL;
  checkpoint = 2;
  printf("forward=%d,%d backward=%d,%d\n", head->data, head->next->data, tail->data, tail->prev->data);
  free(tail); free(head);
  return checkpoint - 2;
}
