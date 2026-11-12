#include <stdio.h>
#include <stdlib.h>
typedef struct node { int data; struct node *left, *right; } NODE;
NODE *insert(NODE *root, int value);
void inorder(NODE *root);
NODE *insert(NODE *root, int value) {
    if (root == NULL) { root = (NODE *)malloc(sizeof(NODE)); root->data = value; root->left = root->right = NULL; }
    else if (value < root->data) root->left = insert(root->left, value);
    else root->right = insert(root->right, value);
    return root;
}
void inorder(NODE *root) { if (root != NULL) { inorder(root->left); printf("%d ", root->data); inorder(root->right); } }
int main() {
    NODE *root = NULL; int i, values[5] = {4, 2, 6, 1, 3};
    for (i = 0; i < 5; i++) root = insert(root, values[i]);
    inorder(root);
}
