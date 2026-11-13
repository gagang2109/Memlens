export const starterScaffolds = {
  tree: {
    name: 'Binary tree',
    description: 'Node definition, creation helper and a three-node input. Add height, traversal or another function above main, then call it in main.',
    output: 'Root: 10',
    code: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int value;
    struct Node *left;
    struct Node *right;
} Node;

Node *newNode(int value) {
    Node *node = malloc(sizeof(Node));
    node->value = value;
    node->left = NULL;
    node->right = NULL;
    return node;
}

void destroyTree(Node *root) {
    if (!root) return;
    destroyTree(root->left);
    destroyTree(root->right);
    free(root);
}

// Add your function here, for example: int height(Node *root) { ... }

int main() {
    // Edit this input tree: 10 with children 5 and 15.
    Node *root = newNode(10);
    root->left = newNode(5);
    root->right = newNode(15);
    printf("Root: %d", root->value);
    // Call your function here, before cleanup.
    // Decide whether height counts nodes or edges in your implementation.
    destroyTree(root);
    return 0;
}`,
  },
  list: {
    name: 'Linked list',
    description: 'Singly linked Node, append and cleanup helpers, and input 10 → 20 → 30. Add your list function before main.',
    output: '10 20 30 ',
    code: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int value;
    struct Node *next;
} Node;

Node *append(Node *head, int value) {
    Node *node = malloc(sizeof(Node));
    node->value = value;
    node->next = NULL;
    if (!head) return node;
    Node *tail = head;
    while (tail->next) tail = tail->next;
    tail->next = node;
    return head;
}

void destroyList(Node *head) {
    while (head) {
        Node *next = head->next;
        free(head);
        head = next;
    }
}

// Add your list function here.

int main() {
    Node *head = NULL;
    head = append(head, 10);
    head = append(head, 20);
    head = append(head, 30);
    // Call your function here. Assign its result to head if it changes the head.
    Node *current = head;
    while (current) {
        printf("%d ", current->value);
        current = current->next;
    }
    destroyList(head);
    return 0;
}`,
  },
  stack: {
    name: 'Stack',
    description: 'Array-backed stack with bounded push/pop helpers. Top starts at −1; the caller checks empty before pop.',
    output: 'Top: 30 | popped: 30',
    code: `#include <stdio.h>
#define CAPACITY 8

int push(int *stack, int *top, int value) {
    if (*top >= CAPACITY - 1) return 0;
    *top = *top + 1;
    stack[*top] = value;
    return 1;
}

// Caller must check top >= 0 before popping.
int pop(int *stack, int *top) {
    int value = stack[*top];
    *top = *top - 1;
    return value;
}

// Add your stack algorithm here.

int main() {
    int stack[CAPACITY] = {0};
    int top = -1;
    push(stack, &top, 10);
    push(stack, &top, 20);
    push(stack, &top, 30);
    // Call your function here.
    if (top >= 0) {
        int topValue = stack[top];
        int popped = pop(stack, &top);
        printf("Top: %d | popped: %d", topValue, popped);
    }
    return 0;
}`,
  },
  queue: {
    name: 'Queue',
    description: 'Linked queue with front/rear, enqueue and dequeue helpers. Check front before dequeue; all sample nodes are freed.',
    output: '10 20 30 ',
    code: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int value;
    struct Node *next;
} Node;

void enqueue(Node **front, Node **rear, int value) {
    Node *node = malloc(sizeof(Node));
    node->value = value;
    node->next = NULL;
    if (*rear) (*rear)->next = node;
    else *front = node;
    *rear = node;
}

// Caller must check front != NULL before dequeuing.
int dequeue(Node **front, Node **rear) {
    Node *old = *front;
    int value = old->value;
    *front = old->next;
    if (!*front) *rear = NULL;
    free(old);
    return value;
}

// Add your queue algorithm here.

int main() {
    Node *front = NULL;
    Node *rear = NULL;
    enqueue(&front, &rear, 10);
    enqueue(&front, &rear, 20);
    enqueue(&front, &rear, 30);
    // Call your function here, before draining the queue.
    while (front) printf("%d ", dequeue(&front, &rear));
    return 0;
}`,
  },
  graph: {
    name: 'Graph (matrix)',
    description: 'Four-vertex undirected adjacency matrix using a flat array. Inspect its cells in the call stack; this is not a node-link graph drawing.',
    output: '0 1 1 0 \n1 0 0 0 \n1 0 0 1 \n0 0 1 0 \n',
    code: `#include <stdio.h>
#define VERTICES 4

void addEdge(int *graph, int from, int to) {
    // Vertex IDs must be in 0..VERTICES-1.
    if (from < 0 || from >= VERTICES || to < 0 || to >= VERTICES) return;
    graph[from * VERTICES + to] = 1;
    graph[to * VERTICES + from] = 1;
}

// Add BFS, DFS or another function here, using graph[row * VERTICES + col].

int main() {
    int graph[VERTICES * VERTICES] = {0};
    addEdge(graph, 0, 1);
    addEdge(graph, 0, 2);
    addEdge(graph, 2, 3);
    // Call your function here; edit the addEdge calls to change the input.
    for (int row = 0; row < VERTICES; row++) {
        for (int col = 0; col < VERTICES; col++) {
            printf("%d ", graph[row * VERTICES + col]);
        }
        printf("\\n");
    }
    return 0;
}`,
  },
  function: {
    name: 'Basic function',
    description: 'A small function and explicit hardcoded call. Replace the body, edit input, then step through your function.',
    output: 'Result: 49',
    code: `#include <stdio.h>

int solve(int value) {
    // Replace this body with your algorithm.
    return value * value;
}

int main() {
    int input = 7;
    int result = solve(input);
    printf("Result: %d", result);
    return 0;
}`,
  },
};
export type StarterKey = keyof typeof starterScaffolds;
