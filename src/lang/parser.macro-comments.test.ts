import { expect, it } from 'vitest';
import { run } from '../vm/interpreter';
it.each(['#define N 3 // number', '#define N 3 /* number */'])('numeric define comment: %s', directive => {
 const r=run(`${directive}\nint main(){printf("%d",N);return 0;}`);
 expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('3');
});
it('ignores directives inside multiline comments',()=>{
 const r=run('/*\n#define N 99\n*/\nint main(){int N=3;printf("%d",N);}');
 expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('3');
});
it('preserves quoted comment markers',()=>{
 const r=run('#define URL "https://example.test/*path*/"\nint main(){printf("%s",URL);}');
 expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('https://example.test/*path*/');
});
it('handles multiline trailing comments without losing code lines',()=>{
 const r=run('#define N 3 /* comment\nmore */\nint main(){printf("%d",N);}');
 expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('3');
});
import { parse } from './parser';
import { stripComments } from './comments';
it('preserves diagnostic line after multiline comment',()=>{
 expect(()=>parse('/* first\nsecond */\nint main(){\nint x = 09;\n}')).toThrow(/line 4:/);
});
it('preserves escaped quotes and comment markers inside literals',()=>{
 const text=String.raw`"a\"//b/*c*/"`;
 expect(stripComments(text+' /* removed */')).toBe(text+'              ');
});
it('replaces a comment between identifiers with whitespace',()=>{
 const r=run('int/**/main(){int/**/value=3;printf("%d",value);}');
 expect(r.status).toBe('ok');expect(r.trace.steps.at(-1)?.stdout).toBe('3');
});
