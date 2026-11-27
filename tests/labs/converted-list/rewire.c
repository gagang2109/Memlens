#include <stdio.h>
#include <stdlib.h>
struct Node { int key; struct Node *lchild, *rchild; };
struct Node *make(int key) {
  struct Node *n = malloc(sizeof(struct Node));
  n->key = key; n->lchild = NULL; n->rchild = NULL;
  return n;
}
int main(void) {
  struct Node *root = make(5), *head = make(2), *last = make(9);
  root->lchild = head;
  root->rchild = last;
  head->rchild = root;
  last->lchild = root;
  printf("%d %d %d", head->key, head->rchild->key, head->rchild->rchild->key);
  free(last); free(root); free(head);
  return 0;
}
