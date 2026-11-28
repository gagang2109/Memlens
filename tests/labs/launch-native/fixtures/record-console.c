#include <stdio.h>

#define N 3

struct Score {
    char name[12];
    int seat;
    char section;
    float mark;
};

int read_scores(struct Score rows[], int count) {
    for (int i = 0; i < count; ++i) {
        printf("Record %d?\n", i + 1);
        if (scanf("%11s %d %c %f", rows[i].name, &rows[i].seat,
                  &rows[i].section, &rows[i].mark) != 4) {
            return 0;
        }
    }
    return 1;
}

void sort_by_seat(struct Score rows[], int count) {
    for (int i = 1; i < count; ++i) {
        for (int j = i; j > 0 && rows[j].seat < rows[j - 1].seat; --j) {
            struct Score saved = rows[j - 1];
            rows[j - 1] = rows[j];
            rows[j] = saved;
        }
    }
}

int main(void) {
    struct Score scores[N];
    if (!read_scores(scores, N)) {
        printf("Incomplete record\n");
        return 0;
    }

    int checkpoint = 1;
    sort_by_seat(scores, N);
    checkpoint = 2;

    struct Score *best = scores;
    for (int i = 0; i < N; ++i) {
        if ((scores + i)->mark > best->mark) {
            best = scores + i;
        }
        printf("%d %s %c %.3f\n", scores[i].seat, scores[i].name,
               scores[i].section, scores[i].mark);
    }
    printf("Best: %s\n", best->name);
    return checkpoint - 2;
}
