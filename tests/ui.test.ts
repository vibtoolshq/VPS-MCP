import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('public/panel.html','utf8');
const css=readFileSync('public/panel.css','utf8');
const js=readFileSync('public/panel.js','utf8');
function makeHarness() {
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const elements=new Map<string,MockElement>();
  const calls:{url:string;options:Record<string,unknown>}[]=[];
  const responses=new Map<string,{status:number;body:unknown}>();
  class MockElement {
    textContent='';
    hidden=false;
    disabled=false;
    value='';
    childNodes:MockElement[]=[];
    listeners=new Map<string,Function>();
    classes=new Map<string,boolean>();
    classList={
      toggle:(name:string,enabled:boolean)=>{this.classes.set(name,enabled);},
      add:(name:string)=>{this.classes.set(name,true);}
    };
    constructor(public tag='div'){}
    setAttribute(_name:string,_value:string){}
    focus(){this.classes.set('focused',true);}
    addEventListener(type:string,fn:Function){this.listeners.set(type,fn);}
    append(...nodes:MockElement[]){this.childNodes.push(...nodes);}
    replaceChildren(...nodes:MockElement[]){this.childNodes=nodes;}
    async fire(type:string,event:Record<string,unknown>={}){
      const fn=this.listeners.get(type);assert.ok(fn,'missing listener '+type);
      return await fn({...event,preventDefault(){}});
    }
  }
  for(const id of ids)elements.set(id,new MockElement());
  elements.get('username')!.value='admin';
  elements.get('password')!.value='correct-pass';
  const document={
    getElementById:(id:string)=>elements.get(id)??null,
    createElement:(tag:string)=>new MockElement(tag)
  };
  let confirms=true;
  let clipboard='';
  const location={search:'',path:'/',assign(value:string){this.path=value;}};
  const fetch=async(url:string,options:Record<string,unknown>={})=>{
    calls.push({url,options});
    const response=responses.get(url)||{status:404,body:{error:'missing_mock'}};
    return {ok:response.status>=200&&response.status<300,status:response.status,json:async()=>response.body};
  };
  const context=vm.createContext({
    document,fetch,location,navigator:{clipboard:{writeText:async(v:string)=>{clipboard=v;}}},
    history:{replaceState:()=>undefined},window:{confirm:()=>confirms},setInterval:()=>0,
    URLSearchParams,Date,Number,String,JSON,Math,Array,Promise,console
  });
  return {
    elements,calls,responses,context,location,
    setConfirm(v:boolean){confirms=v;},
    clipboard:()=>clipboard,
    async flush(){await new Promise<void>(resolve=>setImmediate(resolve));},
    async fire(id:string,type='click'){return elements.get(id)!.fire(type);},
    async fireLogin(){return elements.get('login-form')!.fire('submit');},
    status:{
      mcpEnabled:true,endpoint:'https://example.com/mcp',allowedTools:['system_status'],
      oauth:{clients:2,activeTokens:1},system:{cpuCount:2,totalMemoryBytes:4000000000,freeMemoryBytes:2500000000,uptimeSeconds:7200},
      writesEnabled:true,publicHttps:true,enrollmentSeconds:0,
      pendingApprovals:[{id:'approved-request',clientId:'testClient',summary:'Create file allowed.txt'}],
      audit:[{at:'2026-10-28T12:00:00.000Z',action:'login',outcome:'success',actor:'admin'}]
    }
  };
}
test('UI markup, accessibility and CSP-safe text rendering are consistent',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,'Duplicate UI element id');
  const present=new Set(ids);
  const requested=new Set([...js.matchAll(/(?:\$\(|\bput\()\s*'([^']+)'/g)].map(m=>m[1]));
  for(const id of requested)assert.ok(present.has(id),'Missing element: '+id);
  for(const id of ['login-form','enrollment-toggle','approval-card','mcp-toggle','audit-search','copy-endpoint'])assert.ok(present.has(id));
  assert.match(html,/name="viewport"/);
  assert.match(html,/<label\b[^>]*for="username"/);
  assert.match(html,/<label\b[^>]*for="password"/);
  assert.match(html,/aria-live/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/@media/);
  assert.match(css,/prefers-reduced-motion/);
  assert.doesNotMatch(js,/\binnerHTML\s*=/);
  assert.doesNotMatch(js,/\beval\s*\(/);
});
test('UI signs in, renders actual API status, safely filters audit and copies endpoint',async()=>{
  const h=makeHarness();
  h.responses.set('/api/session',{status:401,body:{error:'authentication_required'}});
  h.responses.set('/api/login',{status:200,body:{csrf:'csrf-token'}});
  h.responses.set('/api/status',{status:200,body:h.status});
  vm.runInContext(js,h.context);
  await h.flush();
  assert.equal(h.elements.get('dashboard')!.hidden,true);
  h.responses.set('/api/session',{status:200,body:{csrf:'csrf-token'}});
  await h.fireLogin();
  await h.flush();
  assert.equal(h.elements.get('dashboard')!.hidden,false);
  assert.equal(h.elements.get('mcp-state')!.textContent,'Enabled');
  assert.equal(h.elements.get('policy-label')!.textContent,'Approval-gated writes');
  assert.equal(h.elements.get('audit-rows')!.childNodes.length,1);
  h.elements.get('audit-search')!.value='not_matching';
  await h.fire('audit-search','input');
  assert.equal(h.elements.get('audit-rows')!.childNodes.length,1);
  await h.fire('copy-endpoint');
  assert.equal(h.clipboard(),'https://example.com/mcp');
});
test('dangerous actions require confirmation and authorization CSRF',async()=>{
  const h=makeHarness();
  h.responses.set('/api/session',{status:200,body:{csrf:'csrf-token'}});
  h.responses.set('/api/status',{status:200,body:h.status});
  h.responses.set('/api/approval',{status:200,body:{approved:true}});
  h.responses.set('/api/mcp',{status:200,body:{mcpEnabled:false}});
  vm.runInContext(js,h.context);
  await h.flush();
  h.setConfirm(false);
  const approve=h.elements.get('approval-list')!.childNodes[0]!.childNodes[1]!;
  await approve.fire('click');
  await h.fire('mcp-toggle');
  assert.equal(h.calls.filter(v=>v.url==='/api/approval'||v.url==='/api/mcp').length,0);
  h.setConfirm(true);
  await approve.fire('click');
  const call=h.calls.find(v=>v.url==='/api/approval');
  assert.ok(call);
  assert.equal((call.options.headers as Record<string,string>)['x-csrf-token'],'csrf-token');
});
test('401 on protected status hides the dashboard and requires a new login',async()=>{
  const h=makeHarness();
  h.responses.set('/api/session',{status:200,body:{csrf:'csrf-token'}});
  h.responses.set('/api/status',{status:200,body:h.status});
  vm.runInContext(js,h.context);
  await h.flush();
  assert.equal(h.elements.get('dashboard')!.hidden,false);
  h.responses.set('/api/status',{status:401,body:{error:'unauthorized'}});
  await h.fire('refresh');
  assert.equal(h.elements.get('dashboard')!.hidden,true);
  assert.equal(h.elements.get('login-view')!.hidden,false);
});
test('failed logout keeps the dashboard open and reports an error',async()=>{
  const h=makeHarness();
  h.responses.set('/api/session',{status:200,body:{csrf:'csrf-token'}});
  h.responses.set('/api/status',{status:200,body:h.status});
  h.responses.set('/api/logout',{status:500,body:{error:'internal_error'}});
  vm.runInContext(js,h.context);
  await h.flush();
  await h.fire('logout');
  assert.equal(h.elements.get('dashboard')!.hidden,false);
  assert.match(h.elements.get('notice')!.textContent,/sign out/i);
});
