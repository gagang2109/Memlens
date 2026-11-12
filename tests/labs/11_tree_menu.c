#include <stdio.h>
#include <stdlib.h>

struct Node {
    int data;
    struct Node *left, *right;
};

struct Node *newNode(int value) {
    struct Node *p = (struct Node *)malloc(sizeof *p);
    p->data = value;
    p->left = p->right = NULL;
    return p;
}

void insert(struct Node **root, int value) {
    if (*root == NULL) {
        *root = newNode(value);
        return;
    }
    if (value < (*root)->data) {
        insert(&(*root)->left, value);
    } else if (value > (*root)->data) {
        insert(&(*root)->right, value);
    }
}

void preorder(struct Node *root) {
    if (root == NULL) return;
    printf("%d ", root->data);
    preorder(root->left);
    preorder(root->right);
}

int hasTwoChildren(struct Node *root) {
    return root != NULL && root->left != NULL && root->right != NULL;
}

void deleteLeaf(struct Node **root, int value, int *deleted) {
    if (*root == NULL || *deleted) return;
    if (value < (*root)->data) {
        deleteLeaf(&(*root)->left, value, deleted);
    } else if (value > (*root)->data) {
        deleteLeaf(&(*root)->right, value, deleted);
    } else if ((*root)->left == NULL && (*root)->right == NULL) {
        free(*root);
        *root = NULL;
        *deleted = 1;
    }
}

void sideways(struct Node *root, int depth) {
    if (root == NULL) return;
    sideways(root->right, depth + 1);
    printf("%d ", root->data);
    sideways(root->left, depth + 1);
}

int main(void) {
    struct Node *root = NULL;
    struct Node *s[100];
    int input[16], i = 0, deleted;

    do {
        scanf("%d", &input[i]);
        i++;
    } while (i < 16);

    switch (input[0] ? 1 : 0) {
        case 1:
            root = newNode(input[0]);
            insert(&root, input[3]);
            insert(&root, input[7]);
            break;
        default:
            break;
    }

    preorder(root);
    printf("\n");
    printf("%d\n", hasTwoChildren(root));
    deleted = 0;
    deleteLeaf(&root, input[3], &deleted);
    sideways(root, 0);
    printf("\n");
    s[0] = root;
    return 0;
}
