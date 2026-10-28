import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,mkdirSync,renameSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import * as z from 'zod/v4';
import {hashPassword} from './authentication.js';
import type {AppConfig} from '../shared/config.js';
const savedSchema=z.object({
 version:z.literal(1),
 username:z.string().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
 passwordHash:z.string().regex(/^[a-f0-9]{32}:[a-f0-9]{128}$/)
}).strict();
const sha256=(s:string)=>createHash('sha256').update(s).digest('hex');
function same(a:string,b:string){
 const left=Buffer.from(a),right=Buffer.from(b);
 return left.length===right.length && timingSafeEqual(left,right);
}
export class AdminSetup {
 private ready=false;
 constructor(private config:AppConfig){
   const file=config.MCP_ADMIN_STATE_FILE;
   const marker=file+'.complete';
   if(!existsSync(file) && existsSync(marker))
     throw Error('Previously initialized admin state is missing; restore the backup rather than re-running setup');
   if(existsSync(file)){
     const mode=lstatSync(file);
     if(!mode.isFile()||(mode.mode&0o077)!==0)throw Error('Admin state must be a private regular file');
     const saved=savedSchema.parse(JSON.parse(readFileSync(file,'utf8')));
     config.ADMIN_USERNAME=saved.username;
     config.ADMIN_PASSWORD_HASH=saved.passwordHash;
     if(!existsSync(marker))writeFileSync(marker,'initialized\n',{mode:0o600,flag:'wx'});
     this.ready=true;
   }else if(config.ADMIN_PASSWORD_HASH){
     this.ready=true;
   }else if(!/^[a-f0-9]{64}$/.test(config.MCP_SETUP_TOKEN_HASH)){
     throw Error('A new installation requires an installer-generated setup token hash');
   }
 }
 get required(){return !this.ready;}
 setup(token:string,username:string,password:string){
   if(this.ready)throw Error('Setup already completed');
   if(token.length>256 || !same(sha256(token),this.config.MCP_SETUP_TOKEN_HASH))
     throw Error('Invalid one-time setup proof');
   const account=username.trim();
   if(!/^[a-zA-Z0-9_.-]{3,64}$/.test(account))throw Error('Invalid admin username');
   if(password.length<12 || password.length>1024 || password==='Pass@123' ||
      password.toLowerCase().includes(account.toLowerCase()))
      throw Error('Choose a unique 12+ character password; the starter password is not allowed');
   const saved=savedSchema.parse({version:1,username:account,passwordHash:hashPassword(password)});
   const file=this.config.MCP_ADMIN_STATE_FILE;
   const marker=file+'.complete';
   mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
   const temp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
   try{
     writeFileSync(temp,JSON.stringify(saved),{mode:0o600,flag:'wx'});
     if(existsSync(file))throw Error('Admin account already initialized');
     renameSync(temp,file);
     // A separate durable marker prevents re-opening first-run setup if the admin
     // credentials file is lost while an installer token hash remains configured.
     if(!existsSync(marker))writeFileSync(marker,'initialized\n',{mode:0o600,flag:'wx'});
     this.config.ADMIN_USERNAME=saved.username;
     this.config.ADMIN_PASSWORD_HASH=saved.passwordHash;
     this.ready=true;
   }finally{if(existsSync(temp))unlinkSync(temp);}
 }
}
