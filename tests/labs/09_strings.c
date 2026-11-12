#include <stdio.h>
int main() {
    char text[8] = "hello"; int n, i; n = 0;
    while (text[n] != '\0') n++;
    printf("%d ", n);
    for (i = n - 1; i >= 0; i--) printf("%c", text[i]);
}
