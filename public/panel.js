'use strict';
// Dashboard-only client: no auth bypass, no direct privileged broker or terminal calls.
const $ = id => document.getElementById(id);
const state = { csrf:'', signedIn:false, mcpEnabled:false, enrollmentSeconds:0, endpoint:'', audit:[], refreshing:false, activeAction:false, countdownEnd:0, networkEditing:false, networkDraftDomain:'', networkResolvedDomain:'' };
state.dnsConnected=false;state.dnsZone='';state.dnsRecords=[];state.dnsEditingId='';state.dnsEditingContent='';
const put = (id, value) => { $(id).textContent = String(value ?? ''); };
const asArray = value => Array.isArray(value) ? value : [];
const formatBytes = value => Number.isFinite(value) && value>=0 ? (value/1073741824).toFixed(1)+' GiB' : '—';
const validDate = value => { const parsed=new Date(value); return Number.isNaN(parsed.getTime())?'Unknown':parsed.toLocaleString(); };
function feedback(message='',kind='error',target='notice'){
  const element=$(target);
  element.textContent=message;
  element.classList.toggle('success',kind==='success');
  element.classList.toggle('error',kind==='error');
}
function showLogin(message='',focus=false){
  state.signedIn=false;state.csrf='';state.networkEditing=false;state.networkResolvedDomain='';
  $('dashboard').hidden=true;$('setup-view').hidden=true;$('logout').hidden=true;$('login-view').hidden=false;
  if(message)feedback(message,'error','login-message');
  if(focus)$('username').focus();
}
function showDashboard(){
  state.signedIn=true;
  $('login-view').hidden=true;$('setup-view').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;
  switchPage('overview');
}
function humanError(error){
  if(error && error.network)return 'Cannot reach the control panel. Check the server or your connection.';
  if(error && error.status===403)return 'Request denied. Check access permissions or the current session.';
  if(error && error.status===409)return 'This action expired or was already handled. Refresh and try again.';
  if(error && error.status===429)return 'Too many requests. Try again later.';
  if(error && error.status===503)return 'Server configuration or audit storage is unavailable. No change was confirmed. Check service logs.';
  return 'The request failed. Refresh the panel and try again.';
}
async function api(url,options={}){
  let response;
  try {response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});}
  catch {throw {network:true};}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    if(response.status===401 && !['/api/login','/api/session'].includes(url)){
      showLogin('Session expired. Sign in again.',true);
    }
    throw {status:response.status,code:data.error};
  }
  return data;
}
function renderAudit(){
  const rows=$('audit-rows');
  const filter=$('audit-search').value.trim().toLowerCase();
  const matching=state.audit.filter(event=>[event.at,event.action,event.outcome,event.actor].join(' ').toLowerCase().includes(filter));
  rows.replaceChildren();
  if(!matching.length){
    const row=document.createElement('tr');const cell=document.createElement('td');
    cell.colSpan=4;cell.textContent=filter?'No matching audit events':'No audit events yet';
    row.append(cell);rows.append(row);return;
  }
  for(const event of matching){
    const row=document.createElement('tr');
    const values=[validDate(event.at),event.action,event.outcome,event.actor];
    values.forEach((value,index)=>{
      const cell=document.createElement('td');cell.textContent=String(value??'');
      if(index===2)cell.className=value==='success'?'ok':value==='denied'||value==='error'?'bad':'';
      row.append(cell);
    });
    rows.append(row);
  }
}
function makeButton(label,style,callback){
  const element=document.createElement('button');
  element.type='button';element.className=style;element.textContent=label;
  element.addEventListener('click',callback);
  return element;
}
function renderApprovals(items,writesEnabled){
  $('approval-card').hidden=!writesEnabled;
  const root=$('approval-list');root.replaceChildren();
  if(!writesEnabled)return;
  if(!items.length){
    const empty=document.createElement('p');empty.className='sub tight';
    empty.textContent='No pending operations';root.append(empty);return;
  }
  for(const item of items){
    const row=document.createElement('div');row.className='approval-row';
    const description=document.createElement('span');description.className='approval-summary';
    description.textContent=String(item.summary||'Unknown operation')+' · Client '+String(item.clientId||'unknown');
    row.append(description);
    const controls=[];
    const selected=state.policy?.actions?.find(v=>v.name===item.action);
    const blocked=selected && !selected.effective;
    for(const approve of [true,false]){
      const button=makeButton(approve?'Approve':'Deny',approve?'primary small':'ghost small',async()=>{
        if(state.activeAction)return;
        const prompt=(approve?'Approve this exact operation?':'Deny this operation?')+'\n\n'+description.textContent;
        if(!window.confirm(prompt))return;
        state.activeAction=true;controls.forEach(b=>b.disabled=true);
        try{
          await api('/api/approval',{method:'POST',
            headers:{'content-type':'application/json','x-csrf-token':state.csrf},
            body:JSON.stringify({id:item.id,approve})});
          await refresh();
          if(state.signedIn)feedback(approve?'Operation approved. The client may execute it once.':'Operation denied.','success');
        }catch(error){
          if(state.signedIn){feedback(humanError(error));await refresh();}
        }finally{state.activeAction=false;controls.forEach(b=>b.disabled=false);}
      });
      if(approve && blocked){button.disabled=true;button.title='Operation disabled by policy';}
      controls.push(button);row.append(button);
    }
    root.append(row);
  }
}
function updateEnrollmentLabel(){
  const left=Math.max(0,Math.ceil((state.countdownEnd-Date.now())/1000));
  state.enrollmentSeconds=left;
  put('enrollment-state',left>0?'Open · '+left+'s remaining':'Enrollment closed');
  put('enrollment-toggle',left>0?'Close enrollment':'Open for 5 min');
  $('enrollment-toggle').setAttribute('aria-pressed',String(left>0));
}

const TOOL_HELP={
  system_status:'CPU, RAM, uptime and load averages',
  disk_usage:'Disk statistics for / and /tmp',
  workspace_list:'List files inside configured read-only workspace',
  workspace_read:'Read text files from configured workspace',
  docker_status:'Inspect an allowlisted Docker container',
  deployment_status:'Read fixed repository state',
  operation_request:'Request a write operation for manual approval',
  operation_execute:'Execute one approved write request'
};
const expandedClients=new Set();
const ACTION_HELP={
  'file.create':'Create a new file in a restricted workspace',
  'docker.restart':'Restart only an explicitly allowlisted container',
  'deploy.sync':'Fast-forward update of trusted configured Git repository'
};
function settingRow(title,description,enabled,configured,onChange,effective=enabled){
  const row=document.createElement('div');row.className='permission-item';
  const content=document.createElement('div');content.className='permission-description';
  const name=document.createElement('div');name.className='permission-name';name.textContent=title;
  const detail=document.createElement('p');detail.className='sub';
  detail.textContent=!configured?'Locked by server configuration · '+description:
  (enabled&&!effective?'Currently blocked by another policy · '+description:description);
  content.append(name,detail);
  const button=makeButton(enabled?'On':'Off','toggle permission-state',()=>onChange(button));
  button.disabled=!configured;button.setAttribute('aria-pressed',String(enabled));
  button.setAttribute('aria-label',(enabled?'Disable ':'Enable ')+title);
  row.append(content,button);
  return row;
}
function renderAdvanced(data){
  const policy=data.policy;
  const toolRoot=$('control-permissions');
  const actionRoot=$('action-permissions');
  const clientsRoot=$('client-list');
  toolRoot.replaceChildren();actionRoot.replaceChildren();clientsRoot.replaceChildren();
  const tools=asArray(policy?.tools),actions=asArray(policy?.actions),clients=asArray(data.clients);
  if(!policy){
    for(const root of [toolRoot,actionRoot,clientsRoot]){
      const note=document.createElement('p');note.className='offline-note';
      note.textContent='Advanced controls unavailable on this server version';
      root.append(note);
    }
    $('write-master').disabled=true;
    put('write-gate-status','Not available');
    return;
  }
  for(const tool of tools){
    toolRoot.append(settingRow(tool.name,TOOL_HELP[tool.name]||'MCP tool',tool.enabled,tool.configured,async(button)=>{
      if(tool.enabled&&!window.confirm('Disable '+tool.name+' for ALL clients immediately?'))return;
      await runAction(button,
        ()=>api('/api/control/tool',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':state.csrf},
          body:JSON.stringify({name:tool.name,enabled:!tool.enabled})}),'Tool policy updated.');
    },tool.effective));
  }
  const configured=policy.writeConfigured===true;
  const enabled=configured&&!policy.writeGatePaused;
  state.writeGateEnabled=enabled;
  put('write-gate-status',!configured?'Write capability locked by server environment.':
    (policy.writeGatePaused?'Write access manually paused.':
    (policy.writeEffective?'Write gate enabled; approval still required.':'Write gate ON, but required MCP tools are disabled.')));
  put('write-master',enabled?'Pause writes':'Allow writes');
  $('write-master').disabled=!configured;
  $('write-master').setAttribute('aria-pressed',String(enabled));
  for(const action of actions){
    actionRoot.append(settingRow(action.name,ACTION_HELP[action.name]||'Restricted operation',action.enabled,action.configured,async(button)=>{
      if(!window.confirm((action.enabled?'Disable ':'Enable ')+action.name+' globally?'))return;
      await runAction(button,
        ()=>api('/api/control/action',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':state.csrf},
          body:JSON.stringify({name:action.name,enabled:!action.enabled})}),'Operation policy updated.');
    },action.effective));
  }
  put('client-total',clients.length+' client'+(clients.length===1?'':'s'));
  if(!clients.length){
    const empty=document.createElement('p');empty.className='sub';
    empty.textContent='No registered MCP clients. Open enrollment to connect a trusted account.';
    clientsRoot.append(empty);
  }
  for(const client of clients){
    const record=document.createElement('div');record.className='client-record';
    const head=document.createElement('div');head.className='client-head';
    const left=document.createElement('div');
    const name=document.createElement('div');name.className='client-name';name.textContent=client.name||'MCP client';
    const id=document.createElement('div');id.className='client-id';id.textContent=client.id||'unknown';
    left.append(name,id);head.append(left);
    const revoke=makeButton('Revoke client','ghost danger',async()=>{
      if(!window.confirm('Revoke '+String(client.name||'client')+'? Its access and refresh tokens will be revoked.'))return;
      await runAction(revoke,()=>api('/api/control/revoke-client',{
        method:'POST',headers:{'content-type':'application/json','x-csrf-token':state.csrf},
        body:JSON.stringify({clientId:client.id})}),'Client revoked.');
    });
    head.append(revoke);record.append(head);
    const detail=document.createElement('div');detail.className='client-detail';
    detail.textContent=asArray(client.redirectUris).join(', ')+' · '+(client.accessTokens||0)+' active access token(s)';
    record.append(detail);
    const scopes=document.createElement('div');scopes.className='client-scopes';
    for(const [scope,enabled,configured,effective] of [
      ['vps:read',client.scopes?.readPolicyEnabled!==false,true,client.scopes?.read!==false],
      ['vps:write',client.scopes?.writePolicyEnabled!==false,policy.writeConfigured===true,client.scopes?.write===true]
    ]){
      scopes.append(settingRow(scope,scope==='vps:read'?'Master client read permission':'Maximum write permission; OAuth write consent and approvals still required.',
        enabled,configured,async(button)=>{
          if(!window.confirm((enabled?'Disable ':'Enable ')+scope+' policy for '+String(client.name||client.id)+'?'))return;
          await runAction(button,()=>api('/api/control/client-scope',{method:'POST',
            headers:{'content-type':'application/json','x-csrf-token':state.csrf},
            body:JSON.stringify({clientId:client.id,scope,enabled:!enabled})}),'Client scope policy updated.');
        },effective));
    }
    record.append(scopes);
    const details=document.createElement('details');details.className='client-tools';
    const summary=document.createElement('summary');summary.textContent='Configure tool permissions';
    details.append(summary);
    details.open=expandedClients.has(client.id);
    details.addEventListener('toggle',()=>{
      if(details.open)expandedClients.add(client.id);else expandedClients.delete(client.id);
    });
    for(const tool of asArray(client.tools)){
      details.append(settingRow(tool.name,TOOL_HELP[tool.name]||'',tool.enabled,tool.configured===true,async(button)=>{
        if(tool.enabled&&!window.confirm('Disable '+tool.name+' for this client?'))return;
        await runAction(button,()=>api('/api/control/client-tool',{method:'POST',
          headers:{'content-type':'application/json','x-csrf-token':state.csrf},
          body:JSON.stringify({clientId:client.id,name:tool.name,enabled:!tool.enabled})}),
          'Client permissions updated.');
      },tool.effective));
    }
    record.append(details);clientsRoot.append(record);
  }
}


const PAGES={overview:'Overview',tools:'Tool access',operations:'Operations',clients:'Clients',approvals:'Approvals',network:'Domain & SSL',security:'Security audit'};
function switchPage(key){
  if(!state.signedIn || !Object.hasOwn(PAGES,key))return;
  state.currentPage=key;
  for(const [id,label] of Object.entries(PAGES)){
    $('page-'+id).hidden=id!==key;
    $('nav-'+id).setAttribute('aria-current',id===key?'page':'false');
  }
  put('current-section',PAGES[key]);
  feedback('');
}
function renderNetwork(network){
  const info=network?.applied || {};
  put('network-bind',info.hostBind || 'Not reported');
  put('network-active-port',info.hostPort ?? '—');
  put('network-internal-port',info.internalPort ?? '—');
  put('network-origin',info.origin || 'Not configured');
  put('network-ssl-status',info.ssl==='native-https-configured'?'Native HTTPS configured':'Not installed (private mode)');
  const draft=network?.draft || {domain:'',hostPort:3000,sslMode:'private-only'};
  state.networkDraftDomain=draft.domain||'';
  if(state.networkResolvedDomain && state.networkResolvedDomain!==state.networkDraftDomain){
    state.networkResolvedDomain='';
    put('network-dns-result','Not checked for this draft');
  }
  // Never discard unsubmitted user input on a periodic status refresh.
  if(!state.networkEditing){
    $('network-domain').value=draft.domain || '';
    $('network-port').value=String(draft.hostPort ?? 3000);
    $('network-mode').value=draft.sslMode || 'private-only';
  }
  $('network-check-dns').disabled=!draft.domain || state.networkEditing;
  const pending=Number(draft.hostPort)!==Number(info.hostPort);
  put('network-saved',!network?'Network settings are not available on this server version.':
    state.networkEditing?'Unsaved changes — save the draft before checking DNS or applying a port.':
    pending?'Draft saved — port change NOT applied. Run the SSH command below to apply safely.':
    'Current private port and saved draft match. Domain/SSL plans are NOT deployed.');
  $('network-save').disabled=!network;
  $('network-copy-command').disabled=!network;
}

function render(data){
  state.policy=data.policy||null;
  state.mcpEnabled=data.mcpEnabled===true;
  state.endpoint=typeof data.endpoint==='string'?data.endpoint:'';
  put('connection',data.publicHttps?'● Configured HTTPS':'● Loopback mode');
  put('mcp-state',state.mcpEnabled?'Enabled':'Disabled');
  $('mcp-state').className='metric '+(state.mcpEnabled?'status-ok':'status-error');
  put('mcp-endpoint',state.endpoint||'Endpoint unavailable');
  put('tools-count',asArray(data.allowedTools).length);
  put('clients-count',Number.isFinite(data.oauth?.clients)?data.oauth.clients:'—');
  put('token-count',Number.isFinite(data.oauth?.activeTokens)?data.oauth.activeTokens:'—');
  put('cpu',Number.isFinite(data.system?.cpuCount)?data.system.cpuCount:'—');
  put('memory',data.system?formatBytes(data.system.totalMemoryBytes-data.system.freeMemoryBytes):'—');
  put('uptime',Number.isFinite(data.system?.uptimeSeconds)?Math.floor(data.system.uptimeSeconds/3600)+' hours':'—');
  put('access-mode',data.publicHttps?'HTTPS configured':'Local loopback');
  $('copy-endpoint').disabled=!state.endpoint;
  put('mcp-toggle',state.mcpEnabled?'Disable MCP':'Enable MCP');
  $('mcp-toggle').setAttribute('aria-pressed',String(state.mcpEnabled));
  put('mcp-toggle-desc',state.mcpEnabled?'MCP requests are enabled':'MCP requests are blocked');
  put('policy-label',data.policy?.writeEffective?'Approval-gated writes':'Read-only / writes blocked');
  state.countdownEnd=Date.now()+Math.max(0,Number(data.enrollmentSeconds)||0)*1000;
  updateEnrollmentLabel();
  const toolList=$('tool-list');toolList.replaceChildren();
  for(const name of asArray(data.allowedTools)){
    const item=document.createElement('span');item.className='chip';item.textContent=String(name);toolList.append(item);
  }
  if(!toolList.childNodes.length){
    const item=document.createElement('span');item.className='sub';item.textContent='No tools enabled';toolList.append(item);
  }
  renderApprovals(asArray(data.pendingApprovals),data.writesEnabled===true);
  renderAdvanced(data);
  renderNetwork(data.network);
  renderCloudflare(data.dnsProvider);
  $('approval-not-enabled').hidden=data.writesEnabled===true;
  state.audit=asArray(data.audit);
  renderAudit();
}
async function refresh(){
  if(state.refreshing||!state.signedIn)return;
  state.refreshing=true;$('refresh').disabled=true;put('refresh','↻ Refreshing');
  try{render(await api('/api/status'));}
  catch(error){if(state.signedIn)feedback(humanError(error));}
  finally{state.refreshing=false;$('refresh').disabled=false;put('refresh','↻ Refresh');}
}
function showSetup(){
  state.signedIn=false;state.csrf='';state.networkEditing=false;state.networkResolvedDomain='';
  $('dashboard').hidden=true;$('login-view').hidden=true;$('logout').hidden=true;$('setup-view').hidden=false;
}
async function init(){
  try{
    const initial=await api('/api/setup/status');
    if(initial.required){showSetup();return;}
    const session=await api('/api/session');
    if(typeof session.csrf!=='string'||!session.csrf)throw {status:401};
    state.csrf=session.csrf;showDashboard();
    const next=new URLSearchParams(location.search).get('next')||'';
    if(/^\/oauth\/authorize\?[^#]*$/.test(next)){
      location.assign(next);return;
    }
    await refresh();
  }catch(error){
    showLogin(error?.status===401?'':humanError(error),false);
  }
}
async function runAction(button,request,success){
  if(state.activeAction||!state.signedIn)return;
  state.activeAction=true;button.disabled=true;
  try{
    const outcome=await request();
    await refresh();
    if(state.signedIn){
      if(outcome?.warning)feedback('Action completed, but local policy cleanup needs attention.');
      else feedback(success,'success');
    }
  }catch(error){
    if(state.signedIn)feedback(humanError(error));
  }finally{state.activeAction=false;button.disabled=false;}
}
$('setup-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('setup-button');button.disabled=true;
  feedback('Verifying setup token…','success','setup-message');
  try{
    await api('/api/setup',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        token:$('setup-token').value,
        username:$('setup-user').value.trim(),
        password:$('setup-password').value,
        confirm:$('setup-confirm').value
      })});
    const username=$('setup-user').value.trim();
    for(const id of ['setup-token','setup-password','setup-confirm'])$(id).value='';
    $('username').value=username;showLogin();
    feedback('Account created. Sign in with your new password.','success','login-message');
  }catch(error){
    feedback(error?.status===429?'Too many attempts. Retry later.':
      'Setup failed. Verify the one-time token and choose a strong new password (12+ characters).',
      'error','setup-message');
  }finally{button.disabled=false;}
});
$('login-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('login-button');button.disabled=true;
  feedback('Verifying credentials…','success','login-message');
  try{
    await api('/api/login',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({username:$('username').value.trim(),password:$('password').value})});
    $('password').value='';
    feedback('','success','login-message');
    await init();
  }catch(error){
    feedback(error?.network?humanError(error):error?.status===429?'Too many attempts. Try again later.':'Login unsuccessful. Check your credentials.','error','login-message');
  }finally{button.disabled=false;}
});
$('logout').addEventListener('click',async()=>{
  const button=$('logout');button.disabled=true;
  try{
    await api('/api/logout',{method:'POST',headers:{'x-csrf-token':state.csrf}});
    showLogin('Signed out successfully.',true);
    feedback('Signed out successfully.','success','login-message');
    history.replaceState(null,'','/');
  }catch(error){if(state.signedIn)feedback('Could not complete sign out. '+humanError(error));}
  finally{button.disabled=false;}
});
$('refresh').addEventListener('click',()=>{void refresh();});
$('audit-search').addEventListener('input',renderAudit);
$('copy-endpoint').addEventListener('click',async()=>{
  if(!state.endpoint)return;
  try{
    await navigator.clipboard.writeText(state.endpoint);
    feedback('Endpoint copied. Keep access credentials private.','success');
  }catch{feedback('Clipboard unavailable. Select the endpoint text to copy it.');}
});
$('enrollment-toggle').addEventListener('click',async()=>{
  const active=state.enrollmentSeconds>0;
  if(!active&&!window.confirm('Open OAuth client registration for 5 minutes? Only add clients you trust.'))return;
  await runAction($('enrollment-toggle'),()=>api('/api/enrollment',{method:'POST',
    headers:{'content-type':'application/json','x-csrf-token':state.csrf},
    body:JSON.stringify({enabled:!active})}),active?'Client enrollment closed.':'Enrollment opened temporarily.');
});
$('mcp-toggle').addEventListener('click',async()=>{
  const enabled=!state.mcpEnabled;
  if(!enabled&&!window.confirm('Disable MCP requests? Connected clients will lose access until you re-enable it.'))return;
  await runAction($('mcp-toggle'),()=>api('/api/mcp',{method:'POST',
    headers:{'content-type':'application/json','x-csrf-token':state.csrf},
    body:JSON.stringify({enabled})}),enabled?'MCP requests enabled.':'MCP requests disabled.');
});
setInterval(()=>{if(state.signedIn && state.enrollmentSeconds>0)updateEnrollmentLabel();},1000);
void init();

$('write-master').addEventListener('click',async()=>{
  const enabled=state.writeGateEnabled===true;
  if(!window.confirm((enabled?'Pause':'Enable')+' allowed write operations?'))return;
  await runAction($('write-master'),()=>api('/api/control/writes',{
    method:'POST',headers:{'content-type':'application/json','x-csrf-token':state.csrf},
    body:JSON.stringify({enabled:!enabled})}),enabled?'Writes paused.':'Write gate updated.');
});


for(const name of Object.keys(PAGES)){
  $('nav-'+name).addEventListener('click',()=>switchPage(name));
}
for(const id of ['network-domain','network-port','network-mode']){
  const markEdited=()=>{
    state.networkEditing=true;
    state.networkResolvedDomain='';
    $('network-check-dns').disabled=true;
    feedback('','success','network-feedback');
    put('network-dns-result','Save the draft to check the new domain');
    put('network-saved','Unsaved changes — click Save network plan.');
  };
  $(id).addEventListener('input',markEdited);
  $(id).addEventListener('change',markEdited);
}
$('network-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!state.signedIn)return;
  const domain=$('network-domain').value.trim().toLowerCase();
  const hostPort=Number($('network-port').value);
  const sslMode=$('network-mode').value;
  if(!Number.isInteger(hostPort)||hostPort<1024||hostPort>65535){
    feedback('Choose a private host port from 1024 to 65535.','error','network-feedback');return;
  }
  if(sslMode==='external-https'&&!domain){
    feedback('Enter a domain before planning external HTTPS.','error','network-feedback');return;
  }
  if(!window.confirm('Save this network configuration as a DRAFT? It will NOT apply DNS, SSL or Docker port changes.'))return;
  await runAction($('network-save'),async()=>{
    const outcome=await api('/api/network/plan',{
      method:'POST',headers:{'content-type':'application/json','x-csrf-token':state.csrf},
      body:JSON.stringify({domain,hostPort,sslMode})
    });
    state.networkEditing=false;
    state.networkResolvedDomain='';
    put('network-dns-result','Not checked for this draft');
    feedback('Network plan saved as a draft only. No DNS, SSL or port changes applied.','success','network-feedback');
    return outcome;
  },'Network draft saved. Changes are not applied. Use trusted SSH to apply the private port.');
});
$('network-check-dns').addEventListener('click',async()=>{
  if(!state.signedIn)return;
  const button=$('network-check-dns');button.disabled=true;
  put('network-dns-result','Checking DNS…');
  try{
    const response=await api('/api/network/dns');
    if(state.networkEditing||response.domain!==state.networkDraftDomain)return;
    state.networkResolvedDomain=response.domain;
    const ips=[...asArray(response.ipv4),...asArray(response.ipv6)];
    put('network-dns-result',ips.length?ips.join(', '):'No DNS records resolved');
    if(ips.length)feedback('DNS records found; this does not verify SSL or public service availability.','success','network-feedback');
  }catch(error){
    if(state.signedIn){put('network-dns-result','DNS check failed');feedback(humanError(error),'error','network-feedback');}
  }finally{button.disabled=false;}
});
$('network-copy-command').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText('sudo bash scripts/apply-network.sh');feedback('SSH apply command copied.','success','network-feedback');}
  catch{feedback('Clipboard unavailable. Copy the command shown above.','error','network-feedback');}
});


const DNS_TYPES=new Set(['A','AAAA','CNAME','TXT','MX']);
function dnsError(error){
 const known={
  dns_provider_unreachable:'Cloudflare could not be reached. Check VPS internet access.',
  dns_provider_access_denied:'Cloudflare token lacks access. Use Zone Read and DNS Edit for this zone.',
  dns_provider_not_connected:'Connect a Cloudflare zone first.',
  dns_provider_rate_limited:'Cloudflare rate limit reached; try later.',
  dns_record_changed_refresh_required:'Record changed since you loaded it. Reload and review before deleting.',
  invalid_dns_record:'Check record name, content, TTL and proxy fields.',
  dns_provider_request_failed:'Cloudflare rejected this operation. Check the DNS values and zone permissions.',
  dns_storage_unavailable:'Private DNS settings storage is unavailable.',
  audit_storage_unavailable:'Security audit storage unavailable. No change was authorized.'
 };
 return known[error?.code]||humanError(error);
}
function renderCloudflare(provider){
 const connected=provider?.configured===true;
 const oldZone=state.dnsZone;
 state.dnsConnected=connected;
 state.dnsZone=connected?String(provider.zone||''):'';
 put('dns-provider-status',connected?'Connected · '+state.dnsZone:'Not connected');
 put('dns-zone',state.dnsZone||'—');
 $('dns-connect-form').hidden=connected;
 $('dns-connected-actions').hidden=!connected;
 $('dns-records-panel').hidden=!connected;
 $('dns-refresh').disabled=!connected;
 if(!connected||oldZone!==state.dnsZone){
   state.dnsRecords=[];state.dnsEditingId='';
   $('dns-record-rows').replaceChildren();
   const tr=document.createElement('tr'),td=document.createElement('td');
   td.setAttribute('colspan','5');td.textContent='Select Load DNS records.';tr.append(td);
   $('dns-record-rows').append(tr);
 }
}
function dnsSetFormState(){
 const type=$('dns-type').value;
 $('dns-mx-wrap').hidden=type!=='MX';
 $('dns-proxied').disabled=!['A','AAAA','CNAME'].includes(type);
 if($('dns-proxied').disabled)$('dns-proxied').checked=false;
}
function dnsClearEditor(){
 state.dnsEditingId='';state.dnsEditingContent='';
 $('dns-type').value='A';$('dns-name').value='';$('dns-content').value='';
 $('dns-ttl').value='1';$('dns-priority').value='10';$('dns-proxied').checked=false;
 $('dns-type').disabled=false;
 $('dns-cancel-edit').hidden=true;
 put('dns-record-save','Create record');
 dnsSetFormState();
}
function dnsRow(record){
 const row=document.createElement('tr');
 for(const value of [record.type,record.name,record.content,
   record.ttl===1?'Auto':String(record.ttl)]){
   const td=document.createElement('td');td.textContent=String(value||'—');row.append(td);
 }
 const actions=document.createElement('td'),buttons=document.createElement('div');
 buttons.className='row';
 if(DNS_TYPES.has(record.type)){
   const edit=document.createElement('button');
   edit.type='button';edit.className='ghost';edit.textContent='Edit';
   edit.addEventListener('click',()=>{
     if(!state.signedIn||state.activeAction)return;
     state.dnsEditingId=record.id;state.dnsEditingContent=record.content;
     $('dns-type').value=record.type;$('dns-type').disabled=true;
     $('dns-name').value=record.name;$('dns-content').value=record.content;
     $('dns-ttl').value=String(record.ttl);
     if(!$('dns-ttl').value)$('dns-ttl').value='1';
     $('dns-proxied').checked=record.proxied===true;
     $('dns-priority').value=String(record.priority??10);
     $('dns-cancel-edit').hidden=false;
     put('dns-record-save','Update record');
     dnsSetFormState();
     feedback('Review all record values before updating live DNS.','success','dns-record-feedback');
   });
   const del=document.createElement('button');
   del.type='button';del.className='ghost danger';del.textContent='Delete';
   del.addEventListener('click',async()=>{
     if(!state.signedIn||state.activeAction)return;
     const warning='Permanently delete '+record.type+' '+record.name+'? This changes LIVE Cloudflare DNS.';
     if(!window.confirm(warning)||!window.confirm('Confirm DELETE: '+record.name+'. Website or email access may break.'))return;
     state.activeAction=true;del.disabled=true;
     try{
       await api('/api/dns/record',{method:'POST',
         headers:{'content-type':'application/json','x-csrf-token':state.csrf},
         body:JSON.stringify({action:'delete',id:record.id,confirmName:record.name,confirmType:record.type,expectedContent:record.content})});
       feedback('Record deleted in Cloudflare. DNS caches may take time to update.','success','dns-record-feedback');
       dnsClearEditor();await loadDnsRecords();
     }catch(error){feedback(dnsError(error),'error','dns-record-feedback');}
     finally{state.activeAction=false;del.disabled=false;}
   });
   buttons.append(edit,del);
 }else{
   const locked=document.createElement('span');
   locked.textContent='Read-only';locked.className='sub';buttons.append(locked);
 }
 actions.append(buttons);row.append(actions);return row;
}
async function loadDnsRecords(){
 if(!state.signedIn||!state.dnsConnected)return;
 const button=$('dns-refresh');button.disabled=true;
 try{
   const response=await api('/api/dns/records');
   if(response.zone!==state.dnsZone)return;
   state.dnsRecords=asArray(response.records);
   const rows=$('dns-record-rows');rows.replaceChildren();
   if(!state.dnsRecords.length){
     const tr=document.createElement('tr'),td=document.createElement('td');
     td.setAttribute('colspan','5');td.textContent='No DNS records in this zone';tr.append(td);rows.append(tr);
   }
   for(const record of state.dnsRecords)rows.append(dnsRow(record));
   feedback(state.dnsRecords.length+' records loaded from Cloudflare'+
     (response.limited?' (first 1000 only)':''), 'success','dns-feedback');
 }catch(error){feedback(dnsError(error),'error','dns-feedback');}
 finally{button.disabled=false;}
}
$('dns-type').addEventListener('change',dnsSetFormState);
$('dns-cancel-edit').addEventListener('click',dnsClearEditor);
$('dns-refresh').addEventListener('click',loadDnsRecords);
$('dns-connect-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!state.signedIn||state.activeAction)return;
 const zoneId=$('dns-zone-id').value.trim();
 const token=$('dns-token').value.trim();
 if(!window.confirm('Connect this Cloudflare zone? The API token is saved only in private server storage and is not displayed again.'))return;
 state.activeAction=true;$('dns-connect').disabled=true;
 try{
   await api('/api/dns/connect',{method:'POST',
     headers:{'content-type':'application/json','x-csrf-token':state.csrf},
     body:JSON.stringify({zoneId,token})});
   $('dns-token').value='';$('dns-zone-id').value='';
   await refresh();
   feedback('Cloudflare zone connected. Load records to begin.','success','dns-feedback');
 }catch(error){feedback(dnsError(error),'error','dns-feedback');}
 finally{state.activeAction=false;$('dns-connect').disabled=false;}
});
$('dns-disconnect').addEventListener('click',async()=>{
 if(!state.signedIn||state.activeAction)return;
 if(!window.confirm('Disconnect Cloudflare from this panel? This removes the stored token but does not delete any DNS records.'))return;
 state.activeAction=true;$('dns-disconnect').disabled=true;
 try{
   await api('/api/dns/disconnect',{method:'POST',
     headers:{'content-type':'application/json','x-csrf-token':state.csrf},body:'{}'});
   dnsClearEditor();await refresh();
   feedback('Cloudflare disconnected. Existing DNS records are unchanged.','success','dns-feedback');
 }catch(error){feedback(dnsError(error),'error','dns-feedback');}
 finally{state.activeAction=false;$('dns-disconnect').disabled=false;}
});
$('dns-record-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!state.signedIn||!state.dnsConnected||state.activeAction)return;
 const type=$('dns-type').value,name=$('dns-name').value.trim();
 const record={type,name,content:$('dns-content').value,ttl:Number($('dns-ttl').value),
   proxied:$('dns-proxied').checked===true,...(type==='MX'?{priority:Number($('dns-priority').value)}:{})};
 const edit=!!state.dnsEditingId;
 if(!window.confirm((edit?'UPDATE ':'CREATE ')+type+' '+name+
    ' on Cloudflare? This immediately changes LIVE DNS.'))return;
 state.activeAction=true;$('dns-record-save').disabled=true;
 try{
   await api('/api/dns/record',{method:'POST',
     headers:{'content-type':'application/json','x-csrf-token':state.csrf},
     body:JSON.stringify({action:edit?'update':'create',...(edit?{id:state.dnsEditingId,expectedContent:state.dnsEditingContent}:{}),record})});
   dnsClearEditor();
   feedback('Cloudflare DNS '+(edit?'updated':'created')+'. DNS propagation may take time.','success','dns-record-feedback');
   await loadDnsRecords();
 }catch(error){feedback(dnsError(error),'error','dns-record-feedback');}
 finally{state.activeAction=false;$('dns-record-save').disabled=false;}
});
