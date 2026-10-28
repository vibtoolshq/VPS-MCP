import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, lstatSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { AppConfig } from '../shared/config.js';
import type { AccessIdentity } from './authorization.js';
import { READ_SCOPE, WRITE_SCOPE } from './authorization.js';

type Client = { id: string; redirects: string[]; name: string };
type Pending = { id:string; clientId:string; redirect:string; challenge:string; state:string; resource:string; scope:string; until:number };
type Code = Omit<Pending,'id'|'until'> & {until:number};
type Refresh = AccessIdentity & {until:number};
const random = () => randomBytes(32).toString('base64url');
const digest = (input:string) => createHash('sha256').update(input).digest('base64url');
const equals = (a:string,b:string) => {
  const x=Buffer.from(a), y=Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x,y);
};
export class OAuthError extends Error {
  constructor(public code:string, public status=400) {super(code);}
}

export class OAuthService {
  private clients = new Map<string,Client>();
  private pending = new Map<string,Pending>();
  private codes = new Map<string,Code>();
  private access = new Map<string,AccessIdentity>();
  private refresh = new Map<string,Refresh>();
  private registrationUntil = 0;
  private registrationCount = 0;
  private static readonly MAX_PENDING = 48;
  private static readonly MAX_CODES = 96;
  private static readonly MAX_ACTIVE = 256;
  private static readonly MAX_REFRESH = 256;
  // Registration is normally closed. Administrator can allow a short enrollment period.
  enrollment() { return Math.max(0,Math.ceil((this.registrationUntil-Date.now())/1000)); }
  setEnrollment(enabled:boolean) {
    this.registrationUntil=enabled?Date.now()+5*60_000:0;
    this.registrationCount=0;
    return this.enrollment();
  }
  constructor(private config:AppConfig) {
    const file=config.MCP_STATE_FILE;
    if(!existsSync(file)) return;
    const stateStat=lstatSync(file);
    if(!stateStat.isFile() || (stateStat.mode & 0o077)!==0)
      throw new Error('OAuth state file permissions are insecure');
    const stored=JSON.parse(readFileSync(file,'utf8')) as {
      version:number; clients:Client[]; refresh:[string,Refresh][]
    };
    if(stored.version!==1 || !Array.isArray(stored.clients) || !Array.isArray(stored.refresh)) {
      throw new Error('Invalid persisted OAuth state; refusing to overwrite');
    }
    for(const client of stored.clients) {
      if(typeof client.id!=='string' || typeof client.name!=='string' || !Array.isArray(client.redirects)) {
        throw new Error('Malformed OAuth client state');
      }
      // Removing an allowed redirect URI in configuration revokes its old registrations.
      if(client.redirects.every(uri=>this.config.redirectUris.includes(uri))) this.clients.set(client.id,client);
    }
    for(const [hash,token] of stored.refresh) {
      if(typeof hash==='string' && token && typeof token.until==='number' && token.until>Date.now()) {
        this.refresh.set(hash,token);
      }
    }
  }
  private persist(){
    this.persistSnapshot([...this.clients.values()],[...this.refresh.entries()]);
  }
  private persistSnapshot(clients:Client[],refresh:[string,Refresh][]){
    const file=this.config.MCP_STATE_FILE;
    mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    const temporary=file+'.'+process.pid+'.'+randomBytes(8).toString('hex')+'.tmp';
    const content=JSON.stringify({version:1,clients,refresh});
    try {
      writeFileSync(temporary,content,{mode:0o600,flag:'wx'});
      renameSync(temporary,file);
    } finally {
      if(existsSync(temporary))unlinkSync(temporary);
    }
  }

  private scopes(){return this.config.writesEnabled?[READ_SCOPE,WRITE_SCOPE]:[READ_SCOPE];}
  get resource() {return this.config.origin+'/mcp';}
  get metadataUrl(){return this.config.origin+'/.well-known/oauth-protected-resource';}
  protectedResource() {
    return {resource:this.resource,authorization_servers:[this.config.origin],scopes_supported:this.scopes(),bearer_methods_supported:['header']};
  }
  authorizationServer() {
    return {
      issuer:this.config.origin,
      authorization_endpoint:this.config.origin+'/oauth/authorize',
      token_endpoint:this.config.origin+'/oauth/token',
      registration_endpoint:this.config.origin+'/oauth/register',
      revocation_endpoint:this.config.origin+'/oauth/revoke',
      response_types_supported:['code'],
      grant_types_supported:['authorization_code','refresh_token'],
      token_endpoint_auth_methods_supported:['none'],
      code_challenge_methods_supported:['S256'],
      scopes_supported:[...this.scopes(),'offline_access'],
      client_id_metadata_document_supported:false
    };
  }
  cleanup() {
    const now=Date.now();
    for(const [k,v] of this.pending) if(v.until<now) this.pending.delete(k);
    for(const [k,v] of this.codes) if(v.until<now) this.codes.delete(k);
    for(const [k,v] of this.access) if(v.expires<now) this.access.delete(k);
    for(const [k,v] of this.refresh) if(v.until<now) this.refresh.delete(k);
  }
  register(payload:unknown) {
    this.cleanup();
    if(this.enrollment()===0) throw new OAuthError('registration_closed',403);
    if(this.clients.size>=32 || this.registrationCount>=5) throw new OAuthError('registration_limit',429);
    if(!payload || typeof payload!=='object' || Array.isArray(payload)) throw new OAuthError('invalid_client_metadata');
    const data=payload as Record<string,unknown>;
    const redirects=data.redirect_uris;
    if(!Array.isArray(redirects) || redirects.length<1 || redirects.length>5 ||
       redirects.some(v=>typeof v!=='string'|| !this.config.redirectUris.includes(v))) {
      throw new OAuthError('invalid_redirect_uri');
    }
    if(data.token_endpoint_auth_method && data.token_endpoint_auth_method!=='none') throw new OAuthError('invalid_client_metadata');
    if(data.grant_types && (!Array.isArray(data.grant_types) || data.grant_types.some(v=>!['authorization_code','refresh_token'].includes(v)))) throw new OAuthError('invalid_client_metadata');
    if(data.response_types && (!Array.isArray(data.response_types) || data.response_types.some(v=>v!=='code'))) throw new OAuthError('invalid_client_metadata');
    const id='vpsmcp_'+random();
    const name=typeof data.client_name==='string' ? data.client_name.slice(0,60) : 'MCP client';
    const client={id,redirects,name};
    // Commit new registration before making it visible in memory.
    this.persistSnapshot([...this.clients.values(),client],[...this.refresh.entries()]);
    this.clients.set(id,client);
    this.registrationCount++;
    return {
      client_id:id,
      client_id_issued_at:Math.floor(Date.now()/1000),
      client_name:name,
      redirect_uris:redirects,
      grant_types:['authorization_code','refresh_token'],
      response_types:['code'],
      token_endpoint_auth_method:'none'
    };
  }
  begin(params:URLSearchParams) {
    this.cleanup();
    const clientId=params.get('client_id')||'';
    const redirect=params.get('redirect_uri')||'';
    const client=this.clients.get(clientId);
    if(!client || !client.redirects.includes(redirect)) throw new OAuthError('invalid_client');
    const requested=(params.get('scope')||READ_SCOPE).split(' ').filter(Boolean);
    if(!requested.includes(READ_SCOPE)||requested.some(s=>![...this.scopes(),'offline_access'].includes(s))) throw new OAuthError('invalid_scope');
    const challenge=params.get('code_challenge')||'';
    if(params.get('response_type')!=='code'||params.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(challenge)){
      throw new OAuthError('invalid_request');
    }
    const resource=params.get('resource')||this.resource;
    if(resource!==this.resource) throw new OAuthError('invalid_target');
    const state=params.get('state')||'';
    if(state.length>512) throw new OAuthError('invalid_request');
    if(this.pending.size>=OAuthService.MAX_PENDING) throw new OAuthError('too_many_authorizations',429);
    const id=random();
    const request:Pending={id,clientId,redirect,challenge,resource,state,scope:requested.join(' '),until:Date.now()+5*60_000};
    this.pending.set(id,request);
    return {id,clientName:client.name,scope:request.scope};
  }
  decide(id:string,approved:boolean):string {
    this.cleanup();
    const pending=this.pending.get(id);
    if(!pending) throw new OAuthError('expired_authorization',400);
    this.pending.delete(id);
    const url=new URL(pending.redirect);
    if(!approved) url.searchParams.set('error','access_denied');
    else {
      if(this.codes.size>=OAuthService.MAX_CODES) throw new OAuthError('too_many_codes',429);
      const code=random();
      const {id:unused,until:unusedTime,...rest}=pending;
      this.codes.set(digest(code),{...rest,until:Date.now()+90_000});
      url.searchParams.set('code',code);
    }
    if(pending.state) url.searchParams.set('state',pending.state);
    return url.toString();
  }
  token(fields:URLSearchParams) {
    this.cleanup();
    const grant=fields.get('grant_type');
    const clientId=fields.get('client_id')||'';
    const client=this.clients.get(clientId);
    if(!client) throw new OAuthError('invalid_client',401);
    if(grant==='authorization_code') {
      const code=fields.get('code')||'';
      const entry=this.codes.get(digest(code));
      // Consume the code before any validation; replay is never permitted.
      this.codes.delete(digest(code));
      const verifier=fields.get('code_verifier')||'';
      if(!entry || entry.clientId!==clientId || !client.redirects.includes(fields.get('redirect_uri')||'') ||
        entry.redirect!==fields.get('redirect_uri') || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
        !equals(digest(verifier),entry.challenge) || (fields.get('resource') && fields.get('resource')!==entry.resource)) {
          throw new OAuthError('invalid_grant');
      }
      return this.issue(clientId,entry.scope,entry.resource);
    }
    if(grant==='refresh_token') {
      const token=fields.get('refresh_token')||'';
      const oldHash=digest(token);
      const entry=this.refresh.get(oldHash);
      if(!entry || entry.clientId!==clientId || (fields.get('resource') && fields.get('resource')!==entry.resource)) {
        throw new OAuthError('invalid_grant');
      }
      // Rotate in one durable write: old token removal and new token creation
      // succeed together, or the old credential remains valid for retry.
      return this.issue(clientId,entry.scope,entry.resource,oldHash);
    }
    throw new OAuthError('unsupported_grant_type');
  }
  private issue(clientId:string,scope:string,resource:string,replacedRefresh?:string){
    this.cleanup();
    if(this.access.size>=OAuthService.MAX_ACTIVE ||
      (this.refresh.size>=OAuthService.MAX_REFRESH && !replacedRefresh))
      throw new OAuthError('token_capacity_reached',503);
    const access=random(), refresh=random();
    const identity:AccessIdentity={clientId,scope,resource,expires:Date.now()+60*60_000};
    const refreshClaim:Refresh={...identity,until:Date.now()+30*24*60*60_000};
    const nextRefresh:[string,Refresh][]=[...this.refresh.entries()]
      .filter(([hash])=>hash!==replacedRefresh);
    nextRefresh.push([digest(refresh),refreshClaim]);
    this.persistSnapshot([...this.clients.values()],nextRefresh);
    if(replacedRefresh)this.refresh.delete(replacedRefresh);
    this.access.set(digest(access),identity);
    this.refresh.set(digest(refresh),refreshClaim);
    return {access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope};
  }
  verify(req:IncomingMessage):AccessIdentity|null {
    this.cleanup();
    const header=req.headers.authorization;
    if(!header || !/^Bearer [A-Za-z0-9_-]{30,}$/.test(header)) return null;
    const secret=header.slice(7);
    const claim=this.access.get(digest(secret));
    return claim && claim.expires>Date.now() ? claim : null;
  }
  revoke(fields:URLSearchParams) {
    const id=fields.get('client_id')||'';
    if(!this.clients.has(id)) throw new OAuthError('invalid_client',401);
    const secret=digest(fields.get('token')||'');
    if(this.refresh.get(secret)?.clientId===id) {
      this.persistSnapshot([...this.clients.values()],[...this.refresh.entries()].filter(([key])=>key!==secret));
      this.refresh.delete(secret);
    }
    if(this.access.get(secret)?.clientId===id)this.access.delete(secret);
  }
  hasClient(id:string){return this.clients.has(id);}
  listClients(){
    this.cleanup();
    return [...this.clients.values()].map(c=>({
      id:c.id,name:c.name,redirectUris:[...c.redirects],
      accessTokens:[...this.access.values()].filter(t=>t.clientId===c.id).length
    }));
  }
  revokeClient(id:string){
    if(!this.clients.has(id))throw new OAuthError('unknown_client',404);
    // Persist the revoked registration and refresh credentials BEFORE updating
    // active in-memory access; disk failures must never silently resurrect a revoke.
    this.persistSnapshot(
      [...this.clients.values()].filter(client=>client.id!==id),
      [...this.refresh.entries()].filter(([,value])=>value.clientId!==id)
    );
    this.clients.delete(id);
    for(const [k,v] of this.access)if(v.clientId===id)this.access.delete(k);
    for(const [k,v] of this.refresh)if(v.clientId===id)this.refresh.delete(k);
    for(const [k,v] of this.pending)if(v.clientId===id)this.pending.delete(k);
    for(const [k,v] of this.codes)if(v.clientId===id)this.codes.delete(k);
  }
  stats() {this.cleanup(); return {clients:this.clients.size, activeTokens:this.access.size};}
}
