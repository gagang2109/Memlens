#include <stdio.h>
int factorial(int n);
int fibonacci(int n);
int factorial(int n) { if (n <= 1) return 1; return n * factorial(n - 1); }
int fibonacci(int n) { if (n <= 1) return n; return fibonacci(n - 1) + fibonacci(n - 2); }
int main() { printf("%d %d", factorial(5), fibonacci(7)); }
