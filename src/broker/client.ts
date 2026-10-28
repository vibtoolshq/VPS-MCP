import net from 'node:net';
import type { AppConfig } from '../shared/config.js';
import type { BrokerAction } from './protocol.js';

export async function brokerCall(config:AppConfig, operation:BrokerAction):Promise<unknown> {
  if(!config.MCP_BROKER_SOCKET || config.MCP_BROKER_SECRET.length<32)throw new Error('Execution broker is not configured');
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection(config.MCP_BROKER_SOCKET);
    let received='';let done=false;
    const finish=(err?:Error,value?:unknown)=>{
      if(done)return;
      done=true;
      socket.destroy();
      if(err)reject(err);else resolve(value);
    };
    socket.setTimeout(15_000,()=>finish(new Error('Broker timeout')));
    socket.on('error',()=>finish(new Error('Broker unavailable')));
    socket.on('connect',()=>socket.write(JSON.stringify({secret:config.MCP_BROKER_SECRET,operation})+'\n'));
    socket.on('data',(chunk:Buffer)=>{
      received+=chunk.toString('utf8');
      if(received.length>65536)return finish(new Error('Broker response too large'));
      if(!received.includes('\n'))return;
      try {
        const parsed=JSON.parse(received.split('\n')[0]!) as {ok:boolean;result?:unknown;error?:string};
        if(parsed.ok)finish(undefined,parsed.result);
        else finish(new Error(parsed.error==='denied'?'Broker denied operation':'Broker operation failed'));
      }catch{finish(new Error('Invalid broker response'));}
    });
    socket.on('end',()=>{if(!done)finish(new Error('Broker closed unexpectedly'));});
  });
}
