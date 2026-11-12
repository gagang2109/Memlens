#include <stdio.h>
#include <stdlib.h>
typedef struct node { int data; struct node *prev; struct node *next; } NODE;
int main() {
    NODE *a = (NODE *)malloc(sizeof(NODE)); NODE *b = (NODE *)malloc(sizeof(NODE));
    a->data = 1; b->data = 2; a->next = b; b->prev = a; b->next = NULL; a->prev = NULL;
    printf("%d %d", a->data, a->next->data);
}
