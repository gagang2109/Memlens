#include <stdio.h>
void swap(int *a, int *b);
void swap(int *a, int *b) { int t = *a; *a = *b; *b = t; }
int main() { int a = 3, b = 9; swap(&a, &b); printf("%d %d", a, b); }
