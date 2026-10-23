// Owner CLI. User explicitly approved local retirement and historical budget migration.
// Keeps the original ledger and key in place. No remote SQL or participant content export.
import {writeFileSync,readFileSync,lstatSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {SecurityState,STATE_PATH,hash,deny,GuardError} from './security-state.mjs';
import {auditOnly} from '../cloudflare/budget.mjs';
export function retireAndExport(state,{targetOrigin,targetObjectId}={}){
 const u=new URL(targetOrigin);deny(u.protocol==='https:'&&u.origin===targetOrigin&&/^[a-f0-9]{64}$/.test(targetObjectId||''),400,'TARGET_INVALID','Verify the exact cloud origin and Durable Object ID.');
 return state.transaction(()=>{
  state.stop();const p=state.policy(),rows=state.db.prepare('SELECT id,job,room,day,start,state,result FROM attempts ORDER BY id').all();
  if(!p.betaSecurity?.ledgerId||rows.length>1000||rows.some(r=>r.state==='started'||r.state==='unknown'&&!state.reviewedExecution(r)))throw new GuardError(409,'EXECUTION_REVIEW_REQUIRED','Stop transports and review uncertain executions before migration.');
  const old=p.cloudRetirement;if(old&&(old.targetOrigin!==targetOrigin||old.targetObjectId!==targetObjectId))throw new GuardError(409,'MIGRATION_BOUND','A retired source cannot be redirected to another namespace.');
  const sourceFrozenAt=old?.sourceFrozenAt||state.now();
  const manifest={version:1,targetOrigin,targetObjectId,sourceLedgerId:p.betaSecurity.ledgerId,sourceBindingHash:hash(p.liveLedgerBinding||state.filename),sourceFrozenAt,localRetired:true,sourceSpent:rows.length,attempts:rows.map(auditOnly)};
  state.configure({enabled:false,confirmedFree:false,localTestAuthorization:null,publicBetaAuthorization:null,cloudRetirement:{targetOrigin,targetObjectId,sourceFrozenAt,manifestHash:hash(JSON.stringify(manifest)),spent:rows.length}});return manifest;
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let state;try{
  const [command,inputPath,outputPath]=process.argv.slice(2);deny(command==='retire-export'&&inputPath&&outputPath,400,'ARGS','Use retire-export private-target.json private-baseline.json.');
  const stat=lstatSync(inputPath);deny(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&stat.size<=4096,400,'TARGET_INVALID','Use a private target configuration.');
  state=new SecurityState(STATE_PATH);const manifest=retireAndExport(state,JSON.parse(readFileSync(inputPath,'utf8')));writeFileSync(outputPath,JSON.stringify(manifest),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({retired:true,spent:manifest.sourceSpent,manifestHash:hash(JSON.stringify(manifest)),targetOrigin:manifest.targetOrigin,targetObjectId:manifest.targetObjectId}));
 }catch(e){console.error(JSON.stringify({error:e.code||'MIGRATION_FAILED',message:'Migration did not complete. Verify private export and source retirement before enabling cloud Qloo.'}));process.exitCode=1;}finally{state?.close();}
}
