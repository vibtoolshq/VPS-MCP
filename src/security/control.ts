import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, lstatSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export function loadMcpEnabled(file:string):boolean {
  if(!existsSync(file))return true;
  const stat=lstatSync(file);
  if(!stat.isFile() || (stat.mode & 0o077)!==0) throw new Error('Control file permissions are insecure');
  const stored=JSON.parse(readFileSync(file,'utf8')) as unknown;
  if(!stored || typeof stored!=='object' || !Object.hasOwn(stored,'enabled') ||
    typeof (stored as {enabled:unknown}).enabled!=='boolean') throw new Error('Control state is invalid');
  return (stored as {enabled:boolean}).enabled;
}
export function persistMcpEnabled(file:string,enabled:boolean){
  mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=file+'.'+process.pid+'.'+randomBytes(8).toString('hex')+'.tmp';
  try {
    writeFileSync(temporary,JSON.stringify({enabled}),{mode:0o600,flag:'wx'});
    renameSync(temporary,file);
  } finally {
    if(existsSync(temporary))unlinkSync(temporary);
  }
}
