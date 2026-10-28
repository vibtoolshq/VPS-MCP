import { lstat, readdir, realpath, open, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export type WorkspaceEntry = { name:string; kind:'file'|'directory' };

export function validateRelative(relative:string, allowRoot=false):string[] {
  if(typeof relative!=='string' || relative.length>180 || relative.includes('\\') || relative.includes('\0') || relative.startsWith('/'))
    throw new Error('Invalid relative workspace path');
  if(!relative && allowRoot)return [];
  const parts=relative.split('/');
  if(parts.length>16 || parts.some(p=>!p || p==='.' || p==='..' || p.startsWith('.') || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(p)))
    throw new Error('Workspace path not allowlisted');
  return parts;
}
// Resolve paths by inspecting each component: symlinks are denied, including final leaf.
// The directory must be private to a trusted OS user; untrusted local writers could race paths.
export async function safePath(root:string, relative:string, opts:{rootAllowed?:boolean; missingLeaf?:boolean}={}) {
  if(!root || !path.isAbsolute(root))throw new Error('Workspace root is not configured');
  const components=validateRelative(relative,opts.rootAllowed);
  const base=await realpath(root);
  if((await lstat(base)).isSymbolicLink())throw new Error('Symlink root forbidden');
  let current=base;
  for(let i=0;i<components.length;i++){
    current=path.join(current,components[i]!);
    try{
      const s=await lstat(current);
      if(s.isSymbolicLink())throw new Error('Symlink path forbidden');
      if(i<components.length-1 && !s.isDirectory())throw new Error('Parent is not a directory');
    }catch(err){
      if(opts.missingLeaf && i===components.length-1 && (err as NodeJS.ErrnoException).code==='ENOENT')break;
      throw err;
    }
  }
  if(current!==base && !current.startsWith(base+path.sep))throw new Error('Outside allowed root');
  return current;
}
export async function workspaceList(root:string, relative='') {
  const target=await safePath(root,relative,{rootAllowed:true});
  const s=await stat(target);
  if(!s.isDirectory())throw new Error('Not a directory');
  const entries=await readdir(target,{withFileTypes:true});
  return { path:relative, entries:entries
    .filter(v=>!v.name.startsWith('.') && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(v.name))
    .slice(0,50).map(v=>({
      name:v.name,kind:v.isFile()?'file':v.isDirectory()?'directory':'other'
    })).filter((v):v is WorkspaceEntry=>v.kind!=='other') };
}
export async function workspaceRead(root:string, relative:string) {
  const target=await safePath(root,relative);
  const file=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const s=await file.stat();
    if(!s.isFile() || s.size>65536)throw new Error('File type or size not allowed');
    const data=await file.readFile();
    if(data.includes(0))throw new Error('Binary files are not readable');
    return {path:relative,content:data.toString('utf8')};
  }finally{await file.close();}
}
export async function workspaceCreate(root:string, relative:string, content:string) {
  if(Buffer.byteLength(content,'utf8')>16384)throw new Error('Content too large');
  const target=await safePath(root,relative,{missingLeaf:true});
  // EXCL + NOFOLLOW stops accidental overwrite or final-component symlink following.
  const file=await open(target,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try {await file.writeFile(content,{encoding:'utf8'});}
  finally{await file.close();}
  return {created:relative};
}
