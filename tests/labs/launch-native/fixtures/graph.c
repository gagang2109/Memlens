#include <stdio.h>
int main(void) {
  int graph[6][6] = {
    {0,1,1,0,0,0}, {0,0,0,0,1,0}, {0,0,0,1,1,0},
    {1,0,0,0,0,1}, {0,0,0,0,0,0}, {0,0,1,0,0,0}
  };
  int dist[6] = {-1,-1,-1,-1,-1,-1};
  int parent[6] = {-1,-1,-1,-1,-1,-1};
  int q[6], front = 0, rear = 0;
  q[rear++] = 0; dist[0] = 0;
  int checkpoint = 1;
  while (front < rear) {
    int u = q[front++];
    for (int v = 0; v < 6; v++) {
      if (graph[u][v] && dist[v] < 0) {
        dist[v] = dist[u] + 1;
        parent[v] = u;
        q[rear++] = v;
      }
    }
  }
  checkpoint = 2;
  for (int i = 0; i < 6; i++) printf("%d:%d ", q[i], dist[q[i]]);
  printf("| parent(5)=%d\n", parent[5]);
  return checkpoint - 2;
}
