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
  responses.set('/api/setup/status',{status:200,body:{required:false}});
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
      network:{applied:{origin:'http://127.0.0.1:3000',hostPort:3000,internalPort:3000,hostBind:'127.0.0.1',ssl:'not-configured'},draft:{domain:'',hostPort:3000,sslMode:'private-only'}},
      oauth:{clients:2,activeTokens:1},system:{cpuCount:2,totalMemoryBytes:4000000000,freeMemoryBytes:2500000000,uptimeSeconds:7200},
      writesEnabled:true,publicHttps:true,enrollmentSeconds:0,
      pendingApprovals:[{id:'approved-request',clientId:'testClient',summary:'Create file allowed.txt'}],
      audit:[{at:'2026-10-28T12:00:00.000Z',action:'login',outcome:'success',actor:'admin'}],
      policy:{
        writeConfigured:true,writePaused:false,writeGatePaused:false,writeEffective:true,
        tools:[{name:'system_status',enabled:true,configured:true,effective:true},{name:'docker_status',enabled:false,configured:false,effective:false}],
        actions:[{name:'file.create',enabled:true,configured:true,effective:true},{name:'deploy.sync',enabled:false,configured:false,effective:false}]
      },
      clients:[{id:'vpsmcp_'+'a'.repeat(43),name:'ChatGPT Test',redirectUris:['https://example.com/callback'],accessTokens:1,
        scopes:{read:true,write:true},tools:[{name:'system_status',enabled:true,globalEnabled:true}]}]
    }
  };
}
test('UI markup, accessibility and CSP-safe text rendering are consistent',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,'Duplicate UI element id');
  const present=new Set(ids);
  const requested=new Set([...js.matchAll(/(?:\$\(|\bput\()\s*'([^']+)'/g)].map(m=>m[1]).filter(id=>!['page-','nav-'].includes(id)));
  for(const id of requested)assert.ok(present.has(id),'Missing element: '+id);
  for(const page of ['overview','tools','operations','clients','approvals','network','security']){
    assert.ok(present.has('page-'+page),'Missing page '+page);
    assert.ok(present.has('nav-'+page),'Missing nav '+page);
  }
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
  await h.flush(); // refresh click handler starts an async request without returning its promise
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

test('advanced console has scope toggles and enforces logged-in CSRF settings API',async()=>{
  const h=makeHarness();
  h.responses.set('/api/session',{status:200,body:{csrf:'scope-test-csrf'}});
  h.responses.set('/api/status',{status:200,body:h.status});
  h.responses.set('/api/control/tool',{status:200,body:{ok:true}});
  h.responses.set('/api/control/client-scope',{status:200,body:{ok:true}});
  vm.runInContext(js,h.context);
  await h.flush();
  assert.equal(h.elements.get('control-permissions')!.childNodes.length,2);
  assert.equal(h.elements.get('client-list')!.childNodes.length,1);
  const toolButton=h.elements.get('control-permissions')!.childNodes[0]!.childNodes[1]!;
  h.setConfirm(false);
  await toolButton.fire('click');
  assert.equal(h.calls.some(x=>x.url==='/api/control/tool'),false);
  h.setConfirm(true);
  await toolButton.fire('click');
  const toolCall=h.calls.find(x=>x.url==='/api/control/tool');
  assert.ok(toolCall);
  assert.equal((toolCall.options.headers as Record<string,string>)['x-csrf-token'],'scope-test-csrf');
  const clientRow=h.elements.get('client-list')!.childNodes[0]!;
  const clientScopes=clientRow.childNodes[2]!;
  const readSwitch=clientScopes.childNodes[0]!.childNodes[1]!;
  await readSwitch.fire('click');
  const scopeCall=h.calls.find(x=>x.url==='/api/control/client-scope');
  assert.ok(scopeCall);
  assert.match(String(scopeCall.options.body),/vps:read/);
});

test('advanced UI distinguishes saved switch preferences and effective access',async()=>{
 const h=makeHarness();
 h.responses.set('/api/session',{status:200,body:{csrf:'saved-pref-csrf'}});
 const modified={...h.status,
   policy:{...h.status.policy,writePaused:true,writeGatePaused:false,writeEffective:false,
     tools:[{name:'system_status',enabled:true,configured:true,effective:false}],
     actions:[{name:'file.create',enabled:true,configured:true,effective:false}]},
   clients:[{id:'vpsmcp_'+'x'.repeat(43),name:'Blocked account',redirectUris:[],accessTokens:1,
     scopes:{read:false,write:false,readPolicyEnabled:false,writePolicyEnabled:true},
     tools:[{name:'system_status',enabled:true,configured:true,globalEnabled:true,effective:false}]}]
 };
 h.responses.set('/api/status',{status:200,body:modified});
 vm.runInContext(js,h.context);
 await h.flush();
 assert.equal(h.elements.get('write-master')!.textContent,'Pause writes'); // manual gate is ON, downstream policy blocks
 assert.match(h.elements.get('write-gate-status')!.textContent,/required MCP tools are disabled/);
 const row=h.elements.get('control-permissions')!.childNodes[0]!;
 assert.equal(row.childNodes[1]!.textContent,'On'); // selected preference
 assert.match(row.childNodes[0]!.childNodes[1]!.textContent,/Currently blocked/);
});

test('first visit shows mandatory setup, blocks old login and opens login after choosing a new password',async()=>{
 const h=makeHarness();
 h.responses.set('/api/setup/status',{status:200,body:{required:true,username:'admin'}});
 h.responses.set('/api/setup',{status:200,body:{ok:true}});
 vm.runInContext(js,h.context);
 await h.flush();
 assert.equal(h.elements.get('setup-view')!.hidden,false);
 assert.equal(h.elements.get('login-view')!.hidden,true);
 assert.equal(h.elements.get('dashboard')!.hidden,true);
 h.elements.get('setup-token')!.value='private-test-token';
 h.elements.get('setup-user')!.value='admin';
 h.elements.get('setup-password')!.value='unique-password-2026';
 h.elements.get('setup-confirm')!.value='unique-password-2026';
 await h.fire('setup-form','submit');
 assert.equal(h.elements.get('setup-view')!.hidden,true);
 assert.equal(h.elements.get('login-view')!.hidden,false);
 assert.equal(h.elements.get('username')!.value,'admin');
 assert.equal(h.elements.get('setup-token')!.value,'');
 const call=h.calls.find(x=>x.url==='/api/setup');
 assert.ok(call);
 assert.match(String(call.options.body),/unique-password-2026/);
});

test('sidebar switches between seven compact pages without changing server state',async()=>{
 const h=makeHarness();
 h.responses.set('/api/session',{status:200,body:{csrf:'sidebar-csrf'}});
 h.responses.set('/api/status',{status:200,body:h.status});
 vm.runInContext(js,h.context);await h.flush();
 const pages=['overview','tools','operations','clients','approvals','network','security'];
 assert.equal(h.elements.get('page-overview')!.hidden,false);
 for(const key of pages){
  await h.fire('nav-'+key);
  assert.equal(h.elements.get('page-'+key)!.hidden,false,'page='+key);
  for(const other of pages.filter(x=>x!==key))
    assert.equal(h.elements.get('page-'+other)!.hidden,true,other+' leaked while '+key);
 }
 assert.equal(h.elements.get('current-section')!.textContent,'Security audit');
 assert.equal(h.calls.filter(x=>x.url?.startsWith('/api/control/')).length,0);
});
test('network save is a CSRF-protected draft; diagnostics never claim HTTPS applied',async()=>{
 const h=makeHarness();
 h.responses.set('/api/session',{status:200,body:{csrf:'network-csrf'}});
 h.responses.set('/api/status',{status:200,body:h.status});
 h.responses.set('/api/network/plan',{status:200,body:{ok:true}});
 h.responses.set('/api/network/dns',{status:200,body:{domain:'mcp.example.com',state:'resolved',ipv4:['203.0.113.10'],ipv6:[]}});
 vm.runInContext(js,h.context);await h.flush();
 await h.fire('nav-network');
 assert.equal(h.elements.get('network-ssl-status')!.textContent,'Not installed (private mode)');
 h.elements.get('network-domain')!.value='mcp.example.com';
 h.elements.get('network-port')!.value='3344';
 h.elements.get('network-mode')!.value='external-https';
 h.setConfirm(false);
 await h.fire('network-form','submit');
 assert.equal(h.calls.some(x=>x.url==='/api/network/plan'),false);
 h.setConfirm(true);
 await h.fire('network-form','submit');
 const sent=h.calls.find(x=>x.url==='/api/network/plan');
 assert.ok(sent);
 assert.equal((sent.options.headers as Record<string,string>)['x-csrf-token'],'network-csrf');
 assert.match(String(sent.options.body),/"hostPort":3344/);
 h.responses.set('/api/status',{status:200,body:{...h.status,
   network:{...h.status.network,draft:{domain:'mcp.example.com',hostPort:3344,sslMode:'external-https'}}}});
 await h.fire('refresh');await h.flush();
 await h.fire('network-check-dns');
 assert.equal(h.elements.get('network-dns-result')!.textContent,'203.0.113.10');
});

test('unsaved network edits survive status refresh and invalidate stale DNS',async()=>{
 const h=makeHarness();
 h.responses.set('/api/session',{status:200,body:{csrf:'edit-csrf'}});
 h.responses.set('/api/status',{status:200,body:h.status});
 vm.runInContext(js,h.context);await h.flush();
 await h.fire('nav-network');
 h.elements.get('network-domain')!.value='new.example.org';
 h.elements.get('network-port')!.value='4455';
 await h.fire('network-domain','input');
 assert.equal(h.elements.get('network-check-dns')!.disabled,true);
 await h.fire('refresh');
 await h.flush();
 assert.equal(h.elements.get('network-domain')!.value,'new.example.org');
 assert.equal(h.elements.get('network-port')!.value,'4455');
 assert.match(h.elements.get('network-saved')!.textContent,/Unsaved changes/);
 assert.match(h.elements.get('network-dns-result')!.textContent,/Save the draft/);
});
test('successful network staging clears dirty state and does not claim live SSL',async()=>{
 const h=makeHarness();
 h.responses.set('/api/session',{status:200,body:{csrf:'save-csrf'}});
 h.responses.set('/api/status',{status:200,body:h.status});
 h.responses.set('/api/network/plan',{status:200,body:{ok:true}});
 vm.runInContext(js,h.context);await h.flush();
 h.elements.get('network-domain')!.value='mcp.example.org';
 h.elements.get('network-port')!.value='4444';
 await h.fire('network-domain','input');
 h.responses.set('/api/status',{status:200,body:{
   ...h.status,
   network:{...h.status.network,draft:{domain:'mcp.example.org',hostPort:4444,sslMode:'private-only'}}
 }});
 await h.fire('network-form','submit');
 await h.flush();
 assert.equal(h.elements.get('network-domain')!.value,'mcp.example.org');
 assert.match(h.elements.get('network-saved')!.textContent,/port change NOT applied/);
 assert.equal(h.elements.get('network-ssl-status')!.textContent,'Not installed (private mode)');
});

test('Cloudflare panel keeps API token private and requires confirmation before connecting',async()=>{
 const h=makeHarness();
 h.responses.set('/api/session',{status:200,body:{csrf:'cloudflare-ui-csrf'}});
 h.responses.set('/api/status',{status:200,body:h.status});
 h.responses.set('/api/dns/connect',{status:200,body:{ok:true,provider:{configured:true,zone:'example.org'}}});
 vm.runInContext(js,h.context);await h.flush();
 h.elements.get('dns-zone-id')!.value='a'.repeat(32);
 h.elements.get('dns-token')!.value='secret-cloudflare-test-token';
 h.setConfirm(false);
 await h.fire('dns-connect-form','submit');
 assert.equal(h.calls.some(x=>x.url==='/api/dns/connect'),false);
 h.setConfirm(true);
 h.responses.set('/api/status',{status:200,body:{...h.status,
   dnsProvider:{configured:true,provider:'cloudflare',zone:'example.org',recordsManaged:true}}});
 await h.fire('dns-connect-form','submit');
 const sent=h.calls.find(x=>x.url==='/api/dns/connect');
 assert.ok(sent);
 assert.equal((sent.options.headers as Record<string,string>)['x-csrf-token'],'cloudflare-ui-csrf');
 assert.equal(h.elements.get('dns-token')!.value,'');
 assert.equal(h.elements.get('dns-records-panel')!.hidden,false);
 assert.equal(h.elements.get('dns-zone')!.textContent,'example.org');
});
test('Cloudflare DNS record create and list uses authenticated API; no destructive request without confirmation',async()=>{
 const h=makeHarness();
 h.responses.set('/api/session',{status:200,body:{csrf:'cloudflare-record-csrf'}});
 h.responses.set('/api/status',{status:200,body:{...h.status,
   dnsProvider:{configured:true,provider:'cloudflare',zone:'example.org',recordsManaged:true}}});
 h.responses.set('/api/dns/records',{status:200,body:{zone:'example.org',
   records:[{id:'b'.repeat(32),type:'A',name:'www.example.org',content:'203.0.113.9',ttl:300,proxied:false}]}});
 h.responses.set('/api/dns/record',{status:200,body:{ok:true}});
 vm.runInContext(js,h.context);await h.flush();
 await h.fire('dns-refresh');
 assert.equal(h.elements.get('dns-record-rows')!.childNodes.length,1);
 h.elements.get('dns-type')!.value='A';
 h.elements.get('dns-name')!.value='api';
 h.elements.get('dns-content')!.value='203.0.113.10';
 h.elements.get('dns-ttl')!.value='300';
 h.setConfirm(false);
 await h.fire('dns-record-form','submit');
 assert.equal(h.calls.some(x=>x.url==='/api/dns/record'),false);
 h.setConfirm(true);
 await h.fire('dns-record-form','submit');
 const req=h.calls.find(x=>x.url==='/api/dns/record');
 assert.ok(req);
 assert.equal((req.options.headers as Record<string,string>)['x-csrf-token'],'cloudflare-record-csrf');
 assert.match(String(req.options.body),/"action":"create"/);
});
