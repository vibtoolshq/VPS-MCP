import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

export function loadMcpEnabled(file:string):boolean {
  if(!existsSync(file))return true;
  const stat=statSync(file);
  if(!stat.isFile() || (stat.mode & 0o077)!==0) throw new Error('Control file permissions are insecure');
  const stored=JSON.parse(readFileSync(file,'utf8')) as unknown;
  if(!stored || typeof stored!=='object' || !Object.hasOwn(stored,'enabled') ||
    typeof (stored as {enabled:unknown}).enabled!=='boolean') throw new Error('Control state is invalid');
  return (stored as {enabled:boolean}).enabled;
}
export function persistMcpEnabled(file:string,enabled:boolean){
  mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=file+'.'+process.pid+'.tmp';
  writeFileSync(temporary,JSON.stringify({enabled}),{mode:0o600});
  renameSync(temporary,file);
}
