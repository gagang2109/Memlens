#include <stdio.h>
int main() {
    int matrix[2][2] = {{1, 2}, {3, 4}}, i, j, sum = 0, a, b;
    for (i = 0, j = 0; i < 2; i++, j++) sum += matrix[i][j];
    scanf("%d %d", &a, &b); printf("%d %d", sum, a + b);
}
