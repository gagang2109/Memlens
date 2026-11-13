import { treeHeightCode } from "./ui/practiceHarness";
export const samples = {
  "tree-height": { name: "Practice tree height — separate test setup", code: treeHeightCode },
  snippet: {
    name: "Array sum snippet — no main needed",
    code: `// Write statements directly: main() and includes are optional here.
int values[] = {4, 7, 2};
int total = 0;
for (int i = 0; i < 3; i++) {
    total += values[i];
}
printf("Sum: %d\\n", total);`,
  },
  requested: {
    name: "Push/reverse list — intentional use-after-free",
    code: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int val;
    struct Node *next;
} Node;

Node *push(Node *head, int v) {
    Node *n = malloc(sizeof(Node));
    n->val = v;
    n->next = head;
    return n;
}

Node *reverse(Node *head) {
    Node *prev = NULL;
    while (head) {
        Node *nx = head->next;
        head->next = prev;
        prev = head;
        head = nx;
    }
    return prev;
}

int main() {
    Node *list = NULL;
    for (int i = 1; i <= 4; i++) {
        list = push(list, i * 10);
    }
    list = reverse(list);
    Node *dead = list->next;
    free(dead);
    printf("%d\\n", dead->val);
    return 0;
}`,
  },
  "requested-uaf": {
    name: "Push/reverse use-after-free",
    code: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int val;
    struct Node *next;
} Node;

Node *push(Node *head, int v) {
    Node *n = malloc(sizeof(Node));
    n->val = v;
    n->next = head;
    return n;
}

Node *reverse(Node *head) {
    Node *prev = NULL;
    while (head) {
        Node *nx = head->next;
        head->next = prev;
        prev = head;
        head = nx;
    }
    return prev;
}

int main() {
    Node *list = NULL;
    for (int i = 1; i <= 4; i++) {
        list = push(list, i * 10);
    }
    list = reverse(list);
    Node *dead = list->next;
    free(dead);
    printf("%d\\n", dead->val);
    return 0;
}`,
  },
  tree: {
    name: "BST insert and inorder",
    code: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int value;
    struct Node *left;
    struct Node *right;
} Node;

Node *insert(Node *root, int value) {
    if (!root) {
        Node *node = malloc(sizeof(Node));
        node->value = value;
        node->left = NULL;
        node->right = NULL;
        return node;
    }
    if (value < root->value) {
        root->left = insert(root->left, value);
    } else {
        root->right = insert(root->right, value);
    }
    return root;
}

void inorder(Node *root) {
    if (!root) {
        return;
    }
    inorder(root->left);
    printf("%d ", root->value);
    inorder(root->right);
}

int main() {
    Node *root = NULL;
    root = insert(root, 4);
    root = insert(root, 2);
    root = insert(root, 6);
    root = insert(root, 1);
    root = insert(root, 3);
    inorder(root);
}`,
  },
  "tree-menu": {
    name: "Tree menu — insert, traverse, and delete a leaf",
    code: `#include <stdio.h>
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
    printf("\\n");
    printf("%d\\n", hasTwoChildren(root));
    deleted = 0;
    deleteLeaf(&root, input[3], &deleted);
    sideways(root, 0);
    printf("\\n");
    s[0] = root;
    return 0;
}`,
  },
  stack: {
    name: "Array stack — push/pop/display with MAX",
    code: `#include <stdio.h>
#define MAX 5

int stack[MAX];
int top = -1;

void push(int value) {
    if (top < MAX - 1) {
        stack[++top] = value;
    }
}

int pop() {
    if (top >= 0) {
        return stack[top--];
    }
    return -1;
}

void display() {
    int i;
    for (i = top; i >= 0; i--) {
        printf("%d ", stack[i]);
    }
}

int main() {
    push(10);
    push(20);
    push(30);
    pop();
    display();
}`,
  },
  queue: {
    name: "Linked queue — enqueue/dequeue with front and rear",
    code: `#include <stdio.h>
#include <stdlib.h>

typedef struct node {
    int data;
    struct node *next;
} NODE;

NODE *front = NULL;
NODE *rear = NULL;

void enqueue(int value) {
    NODE *p = malloc(sizeof(NODE));
    p->data = value;
    p->next = NULL;
    if (rear == NULL) {
        front = rear = p;
    } else {
        rear->next = p;
        rear = p;
    }
}

int dequeue() {
    NODE *p;
    int value;
    if (front == NULL) {
        return -1;
    }
    p = front;
    value = p->data;
    front = front->next;
    if (front == NULL) {
        rear = NULL;
    }
    free(p);
    return value;
}

void display() {
    NODE *p = front;
    while (p != NULL) {
        printf("%d ", p->data);
        p = p->next;
    }
}

int main() {
    enqueue(10);
    enqueue(20);
    enqueue(30);
    printf("%d ", dequeue());
    display();
}`,
  },
  factorial: {
    name: "Factorial recursion — watch frames stack",
    code: `#include <stdio.h>

int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

int main() {
    int result = factorial(5);
    printf("%d", result);
}`,
  },
  "use-after-free": {
    name: "Use after free",
    code: `#include <stdio.h>

int main() {
    int *dead = malloc(10);
    int *middle = malloc(30);
    int *tail = malloc(40);
    middle = 0;
    tail = 0;
    free(dead);
    *dead = 1;
}`,
  },
};
