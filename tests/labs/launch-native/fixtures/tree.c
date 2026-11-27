#include <stdio.h>
#include <stdlib.h>
typedef struct Node { int data; struct Node *llink, *rlink; } Node;
Node *insert(Node *root, int x) {
  if (root == NULL) {
    Node *p = malloc(sizeof(Node));
    p->data=x; p->llink=NULL; p->rlink=NULL;
    return p;
  }
  if (x < root->data) root->llink=insert(root->llink,x);
  if (x > root->data) root->rlink=insert(root->rlink,x);
  return root;
}
int height(Node *root) {
  if (root == NULL) return 0;
  int l = height(root->llink), r = height(root->rlink);
  return 1 + (l > r ? l : r);
}
int sum(Node *root) {
  if (root == NULL) return 0;
  return root->data + sum(root->llink) + sum(root->rlink);
}
void cleanup(Node *root) {
  if (root == NULL) return;
  cleanup(root->llink); cleanup(root->rlink); free(root);
}
int main(void) {
  Node *root = NULL;
  root=insert(root, 12); root=insert(root, 7); root=insert(root, 17);
  int checkpoint=1;
  root=insert(root, 8); root=insert(root, 19); root=insert(root, 20); root=insert(root, 17);
  checkpoint=2;
  printf("height=%d sum=%d\n", height(root), sum(root));
  cleanup(root);
  return checkpoint - 2;
}
