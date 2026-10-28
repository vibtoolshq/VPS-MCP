'use strict';
const $ = (id) => document.getElementById(id);
let csrf = '';
let mcpEnabled = true;
const escapeText = value => String(value ?? '');
const put = (id, value) => { $(id).textContent = escapeText(value); };
const bytes = n => (n / (1024**3)).toFixed(1) + ' GiB';
async function api(url, options={}) {
  const response = await fetch(url, {credentials:'same-origin',cache:'no-store',...options});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
async function refresh() {
  try {
    const data=await api('/api/status');
    put('connection',data.publicHttps?'● HTTPS secured':'● Local service');
    put('mcp-state',data.mcpEnabled?'Online':'Disabled');
    put('mcp-endpoint',data.endpoint);
    put('tools-count',data.allowedTools.length);
    put('clients-count',data.oauth.clients);
    put('token-count',data.oauth.activeTokens);
    put('cpu',data.system.cpuCount);
    put('memory',bytes(data.system.totalMemoryBytes - data.system.freeMemoryBytes)+' used');
    put('uptime',Math.floor(data.system.uptimeSeconds / 3600)+' hours');
    put('access-mode',data.publicHttps?'HTTPS':'Loopback only');
    mcpEnabled=data.mcpEnabled;
    put('mcp-toggle',mcpEnabled?'Disable MCP':'Enable MCP');
    put('mcp-toggle-desc',mcpEnabled?'MCP requests enabled':'MCP requests blocked');
    $('approval-card').hidden=!data.writesEnabled;
    put('policy-label',data.writesEnabled?'Approval-gated':'Read-only');
    const approvalList=$('approval-list');approvalList.replaceChildren();
    for(const item of data.pendingApprovals||[]) {
      const line=document.createElement('div');line.className='approval-row';
      const description=document.createElement('span');description.className='approval-summary';
      description.textContent=item.summary+' · '+item.clientId;
      line.append(description);
      for(const [caption,approve] of [['Approve',true],['Deny',false]]) {
        const button=document.createElement('button');button.className=approve?'primary small':'ghost small';
        button.textContent=caption;
        button.addEventListener('click',async()=>{
          button.disabled=true;
          try {
            await api('/api/approval',{method:'POST',
              headers:{'content-type':'application/json','x-csrf-token':csrf},
              body:JSON.stringify({id:item.id,approve})});
            await refresh();
          } catch(error){put('notice',error.message);button.disabled=false;}
        });
        line.append(button);
      }
      approvalList.append(line);
    }
    if(!data.pendingApprovals?.length) {
      const note=document.createElement('p');note.className='sub tight';
      note.textContent='No pending operations';approvalList.append(note);
    }
    const chips=$('tool-list'); chips.replaceChildren();
    for(const name of data.allowedTools){const child=document.createElement('span'); child.className='chip';child.textContent=name;chips.append(child);}
    const rows=$('audit-rows'); rows.replaceChildren();
    for(const event of data.audit) {
      const tr=document.createElement('tr');
      for(const v of [new Date(event.at).toLocaleString(),event.action,event.outcome,event.actor]){
        const td=document.createElement('td');td.textContent=v;td.className=v==='success'?'ok':(v==='denied'||v==='error')?'bad':'';tr.append(td);
      }
      rows.append(tr);
    }
    if(!data.audit.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=4;td.textContent='No audit events yet';tr.append(td);rows.append(tr);}
    put('notice','');
  } catch(error) {put('notice',error.message);}
}
async function init(){
  const params=new URLSearchParams(location.search);
  try {
    const session=await api('/api/session');
    csrf=session.csrf;
    $('login-view').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;
    if(params.has('next') && /^\/oauth\/authorize\?/.test(params.get('next')||'')) {
      location.assign(params.get('next'));return;
    }
    await refresh();
  } catch {
    $('login-view').hidden=false;$('dashboard').hidden=true;$('logout').hidden=true;
  }
}
$('login-form').addEventListener('submit',async event=>{
  event.preventDefault();$('login-button').disabled=true;put('login-message','');
  try {
    const result=await api('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:$('username').value,password:$('password').value})});
    csrf=result.csrf;$('password').value='';
    await init();
  } catch {put('login-message','Login unsuccessful. Verify your credentials.');}
  finally {$('login-button').disabled=false;}
});
$('logout').addEventListener('click',async()=>{
  await api('/api/logout',{method:'POST',headers:{'x-csrf-token':csrf}}).catch(()=>undefined);
  location.assign('/');
});
$('refresh').addEventListener('click',refresh);
$('mcp-toggle').addEventListener('click',async()=>{
  $('mcp-toggle').disabled=true;
  try {await api('/api/mcp',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({enabled:!mcpEnabled})});await refresh();}
  catch(error){put('notice',error.message);}
  finally{$('mcp-toggle').disabled=false;}
});
void init();
