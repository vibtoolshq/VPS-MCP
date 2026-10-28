import { createServer, type IncomingMessage, type ServerResponse, type Server as HttpServer } from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createMcpServer } from './mcp.js';
import { loadConfig, type AppConfig } from '../shared/config.js';
import { SessionManager, type Session } from '../security/authentication.js';
import { OAuthService, OAuthError } from '../security/oauth.js';
import { canRead } from '../security/authorization.js';
import { AuditLog } from '../security/audit.js';
import { systemStatus } from '../tools/system.js';

type Server = HttpServer | HttpsServer;
const MAX_BODY = 16 * 1024;
const MIME: Record<string,string> = {
  '/':'text/html; charset=utf-8',
  '/assets/panel.css':'text/css; charset=utf-8',
  '/assets/panel.js':'text/javascript; charset=utf-8'
};
const STATIC: Record<string,string> = {
  '/':'public/panel.html',
  '/assets/panel.css':'public/panel.css',
  '/assets/panel.js':'public/panel.js'
};
const escape = (input:string) => input.replace(/[&<>"']/g,v=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[v]||v));

function json(res:ServerResponse, code:number, value:unknown, extra:Record<string,string>={}) {
  res.writeHead(code, {'content-type':'application/json; charset=utf-8',...extra});
  res.end(JSON.stringify(value));
}
function text(res:ServerResponse, code:number, message:string, extra:Record<string,string>={}) {
  res.writeHead(code,{'content-type':'text/plain; charset=utf-8',...extra});
  res.end(message);
}
function redirect(res:ServerResponse, to:string) {res.writeHead(302,{location:to});res.end();}
async function body(req:IncomingMessage, format:'form'|'json') {
  const expected=format==='json'?'application/json':'application/x-www-form-urlencoded';
  if(!(req.headers['content-type']||'').toLowerCase().startsWith(expected)) throw new OAuthError('unsupported_media_type',415);
  const parts:Buffer[]=[];
  let size=0;
  for await(const chunk of req) {
    const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    size+=buffer.length;
    if(size>MAX_BODY) throw new OAuthError('request_too_large',413);
    parts.push(buffer);
  }
  const value=Buffer.concat(parts).toString('utf8');
  try {return format==='json'?JSON.parse(value):new URLSearchParams(value);}
  catch {throw new OAuthError('invalid_request');}
}
function authenticated(req:IncomingMessage,res:ServerResponse,sessions:SessionManager):Session|null {
  const session=sessions.get(req);
  if(!session) json(res,401,{error:'authentication_required'});
  return session;
}
function csrf(req:IncomingMessage,res:ServerResponse,sessions:SessionManager,session:Session) {
  if(!sessions.verifyCsrf(session,req.headers['x-csrf-token'] as string|undefined)){
    json(res,403,{error:'csrf_rejected'});return false;
  }
  return true;
}
function consentHtml(name:string,id:string,csrfToken:string){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Authorize VPS-MCP</title><link rel="stylesheet" href="/assets/panel.css"></head><body><div class="shell"><header class="topbar"><div class="brand"><span class="brand-icon">V</span>VPS/MCP</div><span class="tag">OAuth authorization</span></header><main><section class="login-card"><div class="eyebrow">AUTHORIZATION REQUEST</div><h1>Allow MCP access?</h1><p class="sub">The client <strong>${escape(name)}</strong> requests read-only system status and disk information. No terminal or Docker permissions will be granted.</p><form action="/oauth/approve" method="post"><input type="hidden" name="id" value="${escape(id)}"><input type="hidden" name="csrf" value="${escape(csrfToken)}"><button type="submit" name="decision" value="allow" class="primary">Approve read-only access</button><button type="submit" name="decision" value="deny" class="ghost">Deny</button></form><div class="footnote">Confirm only if you initiated this connection.</div></section></main></div></body></html>`;
}
export function createHttpServer(config:AppConfig = loadConfig()) {
  const oauth=new OAuthService(config);
  const sessions=new SessionManager(config);
  const audit=new AuditLog(config.MCP_AUDIT_FILE);
  let mcpEnabled=true;
  const rates=new Map<string,{since:number;count:number}>();
  function rateAllowed(req:IncomingMessage,kind:string,limit:number) {
    const now=Date.now();
    const key=kind+':'+(req.socket.remoteAddress||'unknown');
    const slot=rates.get(key);
    if(slot && now-slot.since<60_000) {
      if(slot.count>=limit)return false;
      slot.count++;return true;
    }
    if(rates.size>2048) {
      for(const [k,v] of rates)if(now-v.since>60_000)rates.delete(k);
      if(rates.size>2048)return false;
    }
    rates.set(key,{since:now,count:1});return true;
  }
  const handler=createMcpHandler(() => createMcpServer(config.allowedTools,audit),{responseMode:'json'});
  const nodeHandler=toNodeHandler(handler);

  const route=async(req:IncomingMessage,res:ServerResponse) => {
    res.setHeader('cache-control','no-store');
    res.setHeader('x-content-type-options','nosniff');
    res.setHeader('x-frame-options','DENY');
    res.setHeader('referrer-policy','no-referrer');
    res.setHeader('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if(config.secureCookies) res.setHeader('strict-transport-security','max-age=15552000');
    try {
      if((req.url||'').length>4096) return text(res,414,'URI too long');
      const host=req.headers.host||'';
      const localHost='127.0.0.1:'+String(req.socket.localPort);
      const peer=req.socket.remoteAddress;
      const localPeer=peer==='127.0.0.1' || peer==='::1' || peer==='::ffff:127.0.0.1';
      // Never trust forwarded headers; only accept the local host alias from loopback peers.
      if(host!==new URL(config.origin).host && !(localPeer && host===localHost)) return text(res,403,'Invalid host');
      if(req.headers.origin && req.headers.origin!==config.origin &&
        !(localPeer && req.headers.origin===`http://${localHost}`)) return text(res,403,'Invalid origin');

      const url=new URL(req.url||'/',config.origin);
      const path=url.pathname;
      if(path==='/health' && req.method==='GET') return json(res,200,{status:'ok',service:'vps-mcp'});
      if(path==='/.well-known/oauth-protected-resource' || path==='/.well-known/oauth-protected-resource/mcp'){
        if(req.method!=='GET') return text(res,405,'Method not allowed');
        return json(res,200,oauth.protectedResource());
      }
      if(path==='/.well-known/oauth-authorization-server' && req.method==='GET')
        return json(res,200,oauth.authorizationServer());
      const asset=STATIC[path];
      if(asset && req.method==='GET') {
        // Fixed path lookup: no user-controlled filesystem path.
        const content=await readFile(asset);
        res.writeHead(200,{'content-type':MIME[path] || 'application/octet-stream'});return res.end(content);
      }
      if(path==='/api/login' && req.method==='POST') {
        const input=await body(req,'json') as Record<string,unknown>;
        const username=typeof input?.username==='string'?input.username:'';
        const password=typeof input?.password==='string'?input.password:'';
        const ip=req.socket.remoteAddress||'unknown';
        const sid=sessions.login(username,password,ip);
        audit.record('login',sid?'success':'denied',sid?username:'anonymous');
        if(!sid) return json(res,401,{error:'login_failed'});
        sessions.setCookie(res,sid);
        return json(res,200,{ok:true,csrf:sessions.csrfForId(sid)});
      }
      // Session cookie is not readable from req until the next request.
      if(path==='/api/session' && req.method==='GET'){
        const session=authenticated(req,res,sessions);if(!session)return;
        return json(res,200,{username:session.username,csrf:session.csrf});
      }
      if(path==='/api/logout' && req.method==='POST'){
        const session=authenticated(req,res,sessions);if(!session)return;
        if(!csrf(req,res,sessions,session))return;
        sessions.logout(req,res);audit.record('logout','success',session.username);
        return json(res,200,{ok:true});
      }
      if(path==='/api/status' && req.method==='GET'){
        const session=authenticated(req,res,sessions);if(!session)return;
        return json(res,200,{
          mcpEnabled,endpoint:config.origin+'/mcp',allowedTools:config.allowedTools,
          oauth:oauth.stats(), system:systemStatus(),publicHttps:config.secureCookies,
          audit:await audit.list(20)
        });
      }
      if(path==='/api/mcp' && req.method==='POST'){
        const session=authenticated(req,res,sessions);if(!session)return;
        if(!csrf(req,res,sessions,session))return;
        const payload=await body(req,'json') as Record<string,unknown>;
        if(typeof payload?.enabled!=='boolean')return json(res,400,{error:'invalid_enabled'});
        mcpEnabled=payload.enabled;
        audit.record('panel.status','success',session.username,mcpEnabled?'enabled':'disabled');
        return json(res,200,{ok:true,mcpEnabled});
      }
      if(path==='/oauth/register' && req.method==='POST'){
        if(!rateAllowed(req,'oauth.register',10))return json(res,429,{error:'rate_limited'},{'retry-after':'60'});
        const registered=oauth.register(await body(req,'json'));
        audit.record('oauth.register','success','client');
        return json(res,201,registered,{'cache-control':'no-store'});
      }
      if(path==='/oauth/authorize' && req.method==='GET'){
        const session=sessions.get(req);
        if(!session) return redirect(res,'/?next='+encodeURIComponent(req.url||'/oauth/authorize'));
        const pending=oauth.begin(url.searchParams);
        res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
        return res.end(consentHtml(pending.clientName,pending.id,session.csrf));
      }
      if(path==='/oauth/approve' && req.method==='POST'){
        const session=sessions.get(req);
        if(!session) return json(res,401,{error:'authentication_required'});
        const form=await body(req,'form') as URLSearchParams;
        if(!sessions.verifyCsrf(session,form.get('csrf')||undefined))return json(res,403,{error:'csrf_rejected'});
        const approved=form.get('decision')==='allow';
        if(!approved && form.get('decision')!=='deny')return json(res,400,{error:'invalid_decision'});
        const location=oauth.decide(form.get('id')||'',approved);
        audit.record('oauth.authorize',approved?'success':'denied',session.username);
        return redirect(res,location);
      }
      if(path==='/oauth/token' && req.method==='POST'){
        if(!rateAllowed(req,'oauth.token',60))return json(res,429,{error:'rate_limited'},{'retry-after':'60'});
        const result=oauth.token(await body(req,'form') as URLSearchParams);
        audit.record('oauth.token','success','client');
        return json(res,200,result,{'pragma':'no-cache'});
      }
      if(path==='/oauth/revoke' && req.method==='POST'){
        oauth.revoke(await body(req,'form') as URLSearchParams);
        audit.record('oauth.refresh','success','client');
        return json(res,200,{});
      }
      if(path==='/mcp') {
        if(!mcpEnabled)return json(res,503,{error:'mcp_disabled'});
        const size=Number(req.headers['content-length']||'0');
        if(!Number.isSafeInteger(size)||size>64*1024)return json(res,413,{error:'request_too_large'});
        if(req.method!=='POST') return text(res,405,'Method not allowed',{'allow':'POST'});
        const identity=oauth.verify(req);
        if(!canRead(identity,config)){
          audit.record('mcp.reject','denied','client');
          return json(res,401,{error:'unauthorized'},{
            'www-authenticate':`Bearer resource_metadata="${oauth.metadataUrl}", scope="vps:read"`
          });
        }
        audit.record('mcp.request','success',identity!.clientId);
        return await nodeHandler(req,res);
      }
      return text(res,404,'Not found');
    } catch(error) {
      if(res.writableEnded)return;
      if(error instanceof OAuthError) {
        audit.record('mcp.reject','denied','anonymous',error.code);
        return json(res,error.status,{error:error.code});
      }
      audit.record('mcp.reject','error');
      return json(res,500,{error:'internal_error'});
    }
  };
  const tls=!!config.MCP_TLS_CERT_FILE;
  const server:Server=tls
    ?createHttpsServer({cert:readFileSync(config.MCP_TLS_CERT_FILE!),key:readFileSync(config.MCP_TLS_KEY_FILE!)},(req,res)=>{void route(req,res);})
    :createServer((req,res)=>{void route(req,res);});
  return {
    server,oauth,
    shutdown:async()=>{
      await handler.close();
      await audit.flush();
      await new Promise<void>((resolve,reject)=>{
        server.close(error=>error?reject(error):resolve());
        server.closeIdleConnections();
      });
    }
  };
}
export async function listenServer(config:AppConfig=loadConfig()) {
  const app=createHttpServer(config);
  try {
    await new Promise<void>((resolve,reject)=>{
      app.server.once('error',reject);
      app.server.listen(config.MCP_PORT,config.MCP_HOST,()=>{
        app.server.off('error',reject);resolve();
      });
    });
  }catch(error){await app.shutdown().catch(()=>undefined);throw error;}
  const address=app.server.address() as AddressInfo;
  return {...app,url:`${config.MCP_TLS_CERT_FILE?'https':'http'}://${config.MCP_HOST}:${address.port}`};
}
export const listenLocal=listenServer;
