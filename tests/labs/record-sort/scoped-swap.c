#include <stdio.h>

struct Student { char name[8]; int roll; char grade; };

int main(void) {
    struct Student rows[3];
    int temp = 99;

    for (int i = 0; i < 3; i++) {
        if (scanf("%7s %d %c", rows[i].name, &rows[i].roll, &rows[i].grade) != 3)
            return 1;
    }

    for (int i = 1; i < 3; i++) {
        for (int j = i; j > 0 && rows[j - 1].roll > rows[j].roll; j--) {
            struct Student temp = rows[j - 1];
            rows[j - 1] = rows[j];
            rows[j] = temp;
        }
        printf("temp=%d\n", temp);
    }
    for (int i = 0; i < 3; i++)
        printf("%d %s %c\n", rows[i].roll, rows[i].name, rows[i].grade);
    return 0;
}
