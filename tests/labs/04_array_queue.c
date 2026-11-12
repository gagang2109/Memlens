#include <stdio.h>
#define MAX 5
int main() {
    int queue[MAX], front = 0, rear = 0;
    queue[rear++] = 7; queue[rear++] = 8;
    while (front < rear) printf("%d ", queue[front++]);
}
