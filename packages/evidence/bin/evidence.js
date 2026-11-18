#!/usr/bin/env node
/** Private dispatcher for the root evidence commands. No standalone discovery or setup. */
import path from 'node:path';
import projectConfig from '../../shared/lib/project-config.cjs';
const [command,...args]=process.argv.slice(2);
const entries={compile:'compiler',add:'cli-add',import:'cli-import',search:'cli-search',resolve:'cli-resolve',guard:'guard',status:'status',stats:'stats'};
try {
  if(!entries[command])throw new Error('Unsupported internal command. Use grainulator --help.');
  if(args.includes('--help')||args.includes('-h')) {const {showCommandHelp}=await import('../lib/cli-help.js');if(!await showCommandHelp(command))throw new Error('No help for this command.');}
  else {if(['compile','status','stats'].includes(command)){const allowed=command==='compile'?['--summary','--check','--json','--quiet','--dir']:['--json','--dir'];for(let j=0;j<args.length;j++){if(!allowed.includes(args[j]))throw new Error(`Unknown option: ${args[j]}`);if(args[j]==='--dir')j++;}}let dir=process.cwd();const i=args.indexOf('--dir');if(i>=0){if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('--dir requires a path.');dir=path.resolve(args[i+1]);args.splice(i,2);}projectConfig.assertMigrationReady(dir);projectConfig.evidenceConfig(dir);await(await import(`../lib/${entries[command]}.js`)).run(dir,args);}
} catch(error) {const message=error.message;if(args.includes('--json'))console.log(JSON.stringify({schema_version:'grainulator.cli-error.v1',status:'error',message,error:{code:error.code||'E_USAGE',message}}));else console.error(`Grainulator: ${message}`);process.exitCode=1;}
