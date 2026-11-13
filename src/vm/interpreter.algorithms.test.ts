import { describe, expect, it } from 'vitest';
import { run } from './interpreter';

// Outputs cross-checked with GCC C11 and UndefinedBehaviorSanitizer.
// These small deterministic programs supplement, not replace, boundary tests.
const cases = [
  {
    "name": "insertion_sort_duplicates",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int a[6]={4,-1,4,0,2,-1};for(int i=1;i<6;i++){int k=a[i],j=i-1;while(j>=0&&a[j]>k){a[j+1]=a[j];j--;}a[j+1]=k;}for(int i=0;i<6;i++)printf(\"%d \",a[i]);}",
    "expected": "-1 -1 0 2 4 4 "
  },
  {
    "name": "selection_sort_reverse",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int a[5]={5,4,3,2,1};for(int i=0;i<4;i++){int m=i;for(int j=i+1;j<5;j++)if(a[j]<a[m])m=j;int t=a[i];a[i]=a[m];a[m]=t;}for(int i=0;i<5;i++)printf(\"%d \",a[i]);}",
    "expected": "1 2 3 4 5 "
  },
  {
    "name": "gcd_recursive",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint gcd(int a,int b){if(b==0)return a;return gcd(b,a%b);}int main(){printf(\"%d %d\",gcd(48,18),gcd(7,1));}",
    "expected": "6 1"
  },
  {
    "name": "fibonacci_iterative",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int a=0,b=1;for(int i=0;i<9;i++){printf(\"%d \",a);int t=a+b;a=b;b=t;}}",
    "expected": "0 1 1 2 3 5 8 13 21 "
  },
  {
    "name": "pascal_row",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int a[6]={1,0,0,0,0,0};for(int r=1;r<6;r++)for(int j=r;j>0;j--)a[j]=a[j]+a[j-1];for(int i=0;i<6;i++)printf(\"%d \",a[i]);}",
    "expected": "1 5 10 10 5 1 "
  },
  {
    "name": "matrix_transpose_materialized",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int a[2][3]={{1,2,3},{4,5,6}},b[3][2];for(int i=0;i<2;i++)for(int j=0;j<3;j++)b[j][i]=a[i][j];for(int i=0;i<3;i++)printf(\"%d %d;\",b[i][0],b[i][1]);}",
    "expected": "1 4;2 5;3 6;"
  },
  {
    "name": "matrix_multiply_sparse_rhs",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int a[2][2]={{1,2},{3,4}},b[2][2]={{2,0},{1,2}},c[2][2]={{0,0},{0,0}};for(int i=0;i<2;i++)for(int j=0;j<2;j++)for(int k=0;k<2;k++)c[i][j]+=a[i][k]*b[k][j];for(int i=0;i<2;i++)for(int j=0;j<2;j++)printf(\"%d \",c[i][j]);}",
    "expected": "4 4 10 8 "
  },
  {
    "name": "sieve_primes",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int a[21]={0};for(int i=2;i<=20;i++)if(!a[i]){printf(\"%d \",i);for(int j=i*i;j<=20;j+=i)a[j]=1;}}",
    "expected": "2 3 5 7 11 13 17 19 "
  },
  {
    "name": "linear_search_last",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int a[5]={1,2,3,2,1},r=-1;for(int i=0;i<5;i++)if(a[i]==2)r=i;printf(\"%d\",r);}",
    "expected": "3"
  },
  {
    "name": "prefix_sum_range",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int a[5]={2,-1,5,3,4},p[6]={0};for(int i=0;i<5;i++)p[i+1]=p[i]+a[i];printf(\"%d %d\",p[5],p[4]-p[1]);}",
    "expected": "13 7"
  },
  {
    "name": "max_subarray",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int a[6]={-2,3,-1,4,-5,2},best=a[0],cur=a[0];for(int i=1;i<6;i++){cur=cur+a[i]>a[i]?cur+a[i]:a[i];if(cur>best)best=cur;}printf(\"%d\",best);}",
    "expected": "6"
  },
  {
    "name": "string_reverse_inplace",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){char s[]=\"memlens\";int n=strlen(s);for(int i=0;i<n/2;i++){char t=s[i];s[i]=s[n-i-1];s[n-i-1]=t;}printf(\"%s\",s);}",
    "expected": "snelmem"
  },
  {
    "name": "string_palindrome",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){char s[]=\"level\";int ok=1,n=strlen(s);for(int i=0;i<n/2;i++)if(s[i]!=s[n-i-1])ok=0;printf(\"%d\",ok);}",
    "expected": "1"
  },
  {
    "name": "string_copy_append",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){char s[20];strcpy(s,\"data\");strcat(s,\" structure\");printf(\"%s %d\",s,(int)strlen(s));}",
    "expected": "data structure 14"
  },
  {
    "name": "binary_digits_stack",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int s[16],t=0,n=42;while(n){s[t++]=n%2;n=n/2;}while(t)printf(\"%d\",s[--t]);}",
    "expected": "101010"
  },
  {
    "name": "queue_reuse_empty",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int q[2],f=0,r=0,n=0;for(int k=1;k<=5;k++){q[r]=k;r=(r+1)%2;n++;printf(\"%d \",q[f]);f=(f+1)%2;n--;}printf(\"n=%d\",n);}",
    "expected": "1 2 3 4 5 n=0"
  },
  {
    "name": "graph_degree",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int g[3][3]={{0,1,1},{1,0,0},{1,0,0}};for(int i=0;i<3;i++){int d=0;for(int j=0;j<3;j++)d+=g[i][j];printf(\"%d \",d);}}",
    "expected": "2 1 1 "
  },
  {
    "name": "warshall_reachability",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int a[3][3]={{0,1,0},{0,0,1},{0,0,0}};for(int k=0;k<3;k++)for(int i=0;i<3;i++)for(int j=0;j<3;j++)a[i][j]=a[i][j]||(a[i][k]&&a[k][j]);printf(\"%d %d\",a[0][2],a[2][0]);}",
    "expected": "1 0"
  },
  {
    "name": "heap_buffer_sum",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int *a=malloc(5*sizeof(int));for(int i=0;i<5;i++)a[i]=i*i;int s=0;for(int i=0;i<5;i++)s+=a[i];printf(\"%d\",s);free(a);}",
    "expected": "30"
  },
  {
    "name": "swap_scalar_addresses",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nvoid swap(int *a,int *b){int t=*a;*a=*b;*b=t;}int main(){int a=3,b=7;swap(&a,&b);printf(\"%d %d\",a,b);}",
    "expected": "7 3"
  },
  {
    "name": "list_count_recursive",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\ntypedef struct N{int v;struct N *next;}N;int count(N *p){if(!p)return 0;return 1+count(p->next);}int main(){N *a=malloc(sizeof(N)),*b=malloc(sizeof(N));a->v=1;a->next=b;b->v=2;b->next=NULL;printf(\"%d %d\",count(a),count(NULL));free(b);free(a);}",
    "expected": "2 0"
  },
  {
    "name": "list_insert_middle",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\ntypedef struct N{int v;struct N *next;}N;int main(){N *a=malloc(sizeof(N)),*b=malloc(sizeof(N)),*c=malloc(sizeof(N));a->v=1;b->v=3;c->v=2;a->next=b;b->next=NULL;c->next=a->next;a->next=c;for(N *p=a;p;p=p->next)printf(\"%d \",p->v);free(a);free(b);free(c);}",
    "expected": "1 2 3 "
  },
  {
    "name": "tree_count_nodes",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\ntypedef struct N{int v;struct N *left;struct N *right;}N;int count(N *p){if(!p)return 0;return 1+count(p->left)+count(p->right);}int main(){N *a=malloc(sizeof(N)),*b=malloc(sizeof(N));a->v=1;a->left=b;a->right=NULL;b->v=2;b->left=NULL;b->right=NULL;printf(\"%d\",count(a));free(b);free(a);}",
    "expected": "2"
  },
  {
    "name": "tree_sum_values",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\ntypedef struct N{int v;struct N *left;struct N *right;}N;int sum(N *p){if(!p)return 0;return p->v+sum(p->left)+sum(p->right);}int main(){N *a=malloc(sizeof(N)),*b=malloc(sizeof(N));a->v=5;a->left=NULL;a->right=b;b->v=8;b->left=NULL;b->right=NULL;printf(\"%d\",sum(a));free(b);free(a);}",
    "expected": "13"
  },
  {
    "name": "binary_search_first_duplicate",
    "source": "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\nint main(){int a[6]={1,2,2,2,4,5},l=0,r=5,res=-1;while(l<=r){int m=(l+r)/2;if(a[m]>=2){if(a[m]==2)res=m;r=m-1;}else l=m+1;}printf(\"%d\",res);}",
    "expected": "1"
  }
];

describe('realistic algorithm regression corpus', () => {
  it.each(cases)('$name', ({ source, expected }) => {
    const result = run(source, 100000);
    expect(result.status).toBe('ok');
    expect(result.trace.steps.at(-1)?.stdout).toBe(expected);
  });
});
