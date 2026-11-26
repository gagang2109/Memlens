#include <stdio.h>
#define N 5

void edge(int g[][N], int a, int b) {
    g[a][b] = 1;
    g[b][a] = 1;
}

void bfs(int g[N][N], int start) {
    int seen[N] = {0};
    int q[N], front = 0, rear = 0;
    seen[start] = 1;
    q[rear++] = start;
    while (front < rear) {
        int v = q[front++];
        printf(" %d", v);
        for (int w = 0; w < N; w++) {
            if (g[v][w] && !seen[w]) {
                seen[w] = 1;
                q[rear++] = w;
            }
        }
    }
}

void dfs(int g[][N], int v, int seen[]) {
    seen[v] = 1;
    printf(" %d", v);
    for (int w = 0; w < N; w++) {
        if (g[v][w] && !seen[w]) dfs(g, w, seen);
    }
}

int main(void) {
    int g[N][N] = {0};
    int seen[N] = {0};
    int start;
    scanf("%d", &start);
    edge(g, 0, 1);
    edge(g, 0, 2);
    edge(g, 1, 3);
    edge(g, 2, 4);
    edge(g, 1, 2);
    printf("BFS:");
    bfs(g, start);
    printf("\nDFS:");
    dfs(g, start, seen);
    printf("\n");
    return 0;
}
