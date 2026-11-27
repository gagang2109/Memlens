#include <stdio.h>
int main(void) {
  int a[7] = {8, -4, 3, 3, 0, -1, 12};
  int checkpoint = 0;
  for (int i = 1; i < 7; i++) {
    int key = a[i], j = i - 1;
    while (j >= 0 && a[j] > key) { a[j + 1] = a[j]; j--; }
    a[j + 1] = key;
  }
  checkpoint = 1;
  int lo = 0, hi = 7;
  while (lo < hi) {
    int mid = lo + (hi - lo) / 2;
    if (a[mid] < 3) lo = mid + 1;
    else hi = mid;
  }
  for (int i = 0; i < 7; i++) printf("%d ", a[i]);
  printf("| first 3=%d\n", lo);
  return checkpoint - 1;
}
