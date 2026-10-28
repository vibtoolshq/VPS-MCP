import {loadConfig} from '../shared/config.js';
import {startBroker} from './server.js';

const config=loadConfig();
startBroker(config).then(broker=>{
  process.stderr.write('Restricted VPS broker started (Unix socket only)\n');
  const stop=()=>{void broker.stop().then(()=>{process.exitCode=0;}).catch(()=>{process.exitCode=1;});};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}).catch(()=>{process.stderr.write('Broker could not start: verify private socket directory and permissions\n');process.exitCode=1;});
