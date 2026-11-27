#include <stdio.h>
int main(void) {
  int k = -1;
  float weight = -1;
  printf("Count?\n");
  if (scanf("%d", &k) != 1) { printf("No count\n"); return 0; }
  printf("Weight?\n");
  if (scanf("%f", &weight) != 1) { printf("No weight\n"); return 0; }
  printf("Weighted sum: %.2f\n", k * weight);
  return 0;
}
