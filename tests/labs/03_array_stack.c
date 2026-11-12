#include <stdio.h>
#define MAX 5
int main() {
    int stack[MAX], top, i; top = -1;
    stack[++top] = 10; stack[++top] = 20;
    for (i = top; i >= 0; i--) printf("%d ", stack[i]);
}
