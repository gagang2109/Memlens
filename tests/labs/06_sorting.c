#include <stdio.h>
void bubble(int a[], int n);
void selection(int a[], int n);
void bubble(int a[], int n) { int i, j, t; for (i = 0; i < n - 1; i++) for (j = 0; j < n - i - 1; j++) if (a[j] > a[j + 1]) { t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; } }
void selection(int a[], int n) { int i, j, min, t; for (i = 0; i < n - 1; i++) { min = i; for (j = i + 1; j < n; j++) if (a[j] < a[min]) min = j; t = a[i]; a[i] = a[min]; a[min] = t; } }
int main() { int a[4] = {4, 1, 3, 2}; bubble(a, 4); printf("%d %d %d %d", a[0], a[1], a[2], a[3]); }
