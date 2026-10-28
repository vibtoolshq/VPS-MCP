#!/usr/bin/env node
import {randomBytes,scryptSync} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
const rl=createInterface({input:stdin,output:stdout});
try{
  const pass=await rl.question('Create admin password (min 12 chars): ');
  if(pass.length<12)throw Error('Password must contain at least 12 characters');
  const salt=randomBytes(16);
  const hash=scryptSync(pass,salt,64,{maxmem:64*1024*1024});
  console.log('ADMIN_PASSWORD_HASH='+salt.toString('hex')+':'+hash.toString('hex'));
}finally{rl.close();}
