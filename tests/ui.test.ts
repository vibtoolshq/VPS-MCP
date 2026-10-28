import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('compact control panel references only existing DOM element IDs',()=>{
  const html=readFileSync('public/panel.html','utf8');
  const js=readFileSync('public/panel.js','utf8');
  const css=readFileSync('public/panel.css','utf8');
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const referenced=new Set([...js.matchAll(/(?:\$\(|\bput\()\s*'([^']+)'/g)].map(m=>m[1]));
  for(const id of referenced) assert.ok(ids.has(id),'Missing UI element: '+id);
  assert.ok(ids.has('login-form'));
  assert.ok(ids.has('enrollment-toggle'));
  assert.ok(ids.has('approval-card'));
  assert.ok(ids.has('mcp-toggle'));
  assert.match(html,/viewport/);
  assert.match(css,/@media/);
  assert.doesNotMatch(js,/\binnerHTML\s*=/); // display dynamic user data as text
});
