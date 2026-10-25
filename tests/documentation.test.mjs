import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

test('onboarding and archived documentation links resolve after folder moves',()=>{
  const files=['README.md','AGENTS.md','CLAUDE.md','CONTRIBUTING.md',
    ...readdirSync('docs').filter(x=>x.endsWith('.md')).map(x=>'docs/'+x),
    ...readdirSync('.github').filter(x=>x.endsWith('.md')).map(x=>'.github/'+x)];
  const missing=[];
  for(const file of files){
    const content=readFileSync(file,'utf8');
    for(const match of content.matchAll(/\]\(([^)]+)\)/g)){
      const href=match[1].split('#')[0];
      if(!href || /^(?:https?:|mailto:|data:)/.test(href))continue;
      if(!existsSync(resolve(dirname(file),href)))missing.push(`${file} -> ${href}`);
    }
  }
  assert.deepEqual(missing,[]);
});
