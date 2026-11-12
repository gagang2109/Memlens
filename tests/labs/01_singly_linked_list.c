#include <stdio.h>
#include <stdlib.h>
typedef struct node { int data; struct node *next; } NODE;
NODE *insertFront(NODE *head, int value);
void display(NODE *head);
NODE *insertFront(NODE *head, int value) {
    NODE *p = (NODE *)malloc(sizeof(NODE));
    p->data = value; p->next = head; return p;
}
void display(NODE *head) {
    while (head != NULL) { printf("%d ", head->data); head = head->next; }
}
int main(void) {
    NODE *head = NULL;
    head = insertFront(head, 30); head = insertFront(head, 20); head = insertFront(head, 10);
    display(head); return 0;
}
