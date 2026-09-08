import {spawn, spawnSync} from 'node:child_process';
import readline from 'node:readline';
export function command(argv, {cwd, env = {}, input, timeout = 60000} = {}) {
  const result = spawnSync(argv[0], argv.slice(1), {cwd, env:{...process.env,NODE_PATH:'',...env}, input, encoding:'utf8', timeout, maxBuffer:8*1024*1024});
  if (result.status !== 0) throw Error(`${argv.slice(0,3).join(' ')} failed (${result.status}): ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
}
export function mcp(argv, {cwd, env = {}} = {}) {
  const child = spawn(argv[0], argv.slice(1), {cwd, env:{...process.env,NODE_PATH:'',...env}, stdio:['pipe','pipe','pipe']});
  let seq=0, stderr=''; const pending=new Map();
  child.stderr.on('data', chunk=>{stderr=(stderr+chunk).slice(-4000);});
  child.stdin.on('error',()=>{});
  readline.createInterface({input:child.stdout}).on('line',line=>{
    let msg;try {msg=JSON.parse(line);} catch {return;}
    const entry=pending.get(msg.id);if(!entry)return;
    pending.delete(msg.id);clearTimeout(entry.timer);
    if(msg.error)entry.reject(Error(JSON.stringify(msg.error)));else entry.resolve(msg.result);
  });
  const fail=err=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(err);}pending.clear();};
  child.on('error',fail);child.on('exit',()=>fail(Error(`MCP exited: ${stderr}`)));
  return {
    async request(method,params={}) {
      const id=++seq;
      const value=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(id);reject(Error(`MCP timeout: ${method}: ${stderr}`));},10000);
        pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
      });
      if(value?.isError)throw Error(JSON.stringify(value));return value;
    },
    notify(method,params={}) {child.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params})+'\n');},
    async close() {child.stdin.end();child.kill('SIGTERM');if(child.exitCode!==null)return;await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},1000);child.once('exit',()=>{clearTimeout(timer);resolve();});});},
  };
}
export function toolJSON(result) {
  const text=result.content?.find(c=>c.type==='text')?.text;
  const value=JSON.parse(text);if(value.status==='error')throw Error(text);return value;
}
