import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { AppConfig } from '../shared/config.js';
import type { AccessIdentity } from './authorization.js';
import { READ_SCOPE } from './authorization.js';

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
  constructor(private config:AppConfig) {}

  get resource() {return this.config.origin+'/mcp';}
  get metadataUrl(){return this.config.origin+'/.well-known/oauth-protected-resource';}
  protectedResource() {
    return {resource:this.resource,authorization_servers:[this.config.origin],scopes_supported:[READ_SCOPE],bearer_methods_supported:['header']};
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
      scopes_supported:[READ_SCOPE,'offline_access'],
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
    if(this.clients.size>=32) throw new OAuthError('registration_limit',429);
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
    this.clients.set(id,{id,redirects,name});
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
    if(!requested.includes(READ_SCOPE)||requested.some(s=>![READ_SCOPE,'offline_access'].includes(s))) throw new OAuthError('invalid_scope');
    const challenge=params.get('code_challenge')||'';
    if(params.get('response_type')!=='code'||params.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(challenge)){
      throw new OAuthError('invalid_request');
    }
    const resource=params.get('resource')||this.resource;
    if(resource!==this.resource) throw new OAuthError('invalid_target');
    const state=params.get('state')||'';
    if(state.length>512) throw new OAuthError('invalid_request');
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
      const entry=this.refresh.get(digest(token));
      this.refresh.delete(digest(token)); // rotating refresh tokens
      if(!entry || entry.clientId!==clientId || (fields.get('resource') && fields.get('resource')!==entry.resource)) {
        throw new OAuthError('invalid_grant');
      }
      return this.issue(clientId,entry.scope,entry.resource);
    }
    throw new OAuthError('unsupported_grant_type');
  }
  private issue(clientId:string,scope:string,resource:string){
    const access=random(), refresh=random();
    const identity:AccessIdentity={clientId,scope,resource,expires:Date.now()+60*60_000};
    this.access.set(digest(access),identity);
    this.refresh.set(digest(refresh),{...identity,until:Date.now()+30*24*60*60_000});
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
    if(this.access.get(secret)?.clientId===id) this.access.delete(secret);
    if(this.refresh.get(secret)?.clientId===id) this.refresh.delete(secret);
  }
  stats() {this.cleanup(); return {clients:this.clients.size, activeTokens:this.access.size};}
}
