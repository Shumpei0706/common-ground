import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hash, GuardError, deny } from './security-state.mjs';
import { validateQuery, parseResponse } from './qloo-guard.mjs';
import { verifyInstallation, credentialStatus, QLOO_HOME_DIR, OFFICIAL_ORIGIN } from './qloo-installation.mjs';
const boundary=fileURLToPath(new URL('./qloo-fetch-boundary.mjs',import.meta.url));
export function cliPlan(input){
 const query=validateQuery(input),search=query.operation==='search',url=new URL(search?'/search':'/v2/insights',OFFICIAL_ORIGIN);
 url.searchParams.set(search?'types':'filter.type','urn:entity:'+query.kind);url.searchParams.set('take',String(query.take));url.searchParams.set(search?'query':'signal.interests.entities',search?query.text:query.entities.join(','));url.searchParams.sort();
 const args=search?['api','search','--query',query.text,'--type',query.kind,'--take',String(query.take)]:['api','insights','--type',query.kind,'--signal-entities',query.entities.join(','),'--take',String(query.take)];
 return {query,requestHash:hash(url.toString()),url:url.toString(),args:[...args,'--json','--quiet','--no-color']};
}
export async function runCli(input,{dryRun=true,signal,approval=null}={},runtime={}){
 const plan=cliPlan(input),installation=verifyInstallation();
 const home=runtime.home||QLOO_HOME_DIR,launch=runtime.spawn||spawn;
 if(!dryRun){
  deny(approval?.endpoint===OFFICIAL_ORIGIN&&approval?.requestHash===plan.requestHash&&Number.isSafeInteger(approval.expires)&&approval.expires>Date.now()&&approval.expires<=Date.now()+900000,423,'CLI_NOT_APPROVED','この正式な探索条件には接続許可がありません。');
  deny(credentialStatus(home)==='saved-unverified',503,'KEY_REQUIRED','安全な保存先へキーを設定してください。');
 }
 deny(!signal?.aborted,423,'LIVE_DISABLED','API処理は停止されました。');
 // CLI 0.1.26 dry-run prints config.base_url rather than QLOO_BASE_URL.
 // Give it an ephemeral, non-secret config; never change the user's key file.
 const dryHome=dryRun?mkdtempSync(path.join(tmpdir(),'cg-qloo-plan-')):null;
 try{
 if(dryHome)writeFileSync(path.join(dryHome,'config'),`base_url=${OFFICIAL_ORIGIN}\ntrusted_base_url=${OFFICIAL_ORIGIN}\n`,{mode:0o600,flag:'wx'});
 const env={PATH:process.env.PATH,NO_COLOR:'1',QLOO_HOME:dryHome||home,QLOO_BASE_URL:OFFICIAL_ORIGIN,QLOO_TRUSTED_BASE_URL:OFFICIAL_ORIGIN,QLOO_NO_GUIDED_START:'1',CG_QLOO_MODE:dryRun?'offline':'live',CG_QLOO_REQUEST_HASH:plan.requestHash};
 // Dry-run uses a visibly synthetic value and cannot fetch, even if the CLI changes.
 if(dryRun)env.QLOO_API_KEY='common-ground-offline-placeholder';
 return await new Promise((resolve,reject)=>{
  const child=launch(process.execPath,['--import',boundary,installation.bin,...plan.args,...(dryRun?['--dry-run']:[])],{env,shell:false,stdio:['ignore','pipe','pipe','ipc']});
  let size=0,errors=0,httpStatus=0,attempts=0,settled=false,failure=null,boundaryReason=null;const chunks=[];
  const fail=code=>{failure??=code;child.kill('SIGKILL');};
  const onAbort=()=>fail('CLI_ABORTED');signal?.addEventListener('abort',onAbort,{once:true});
  const timer=setTimeout(()=>fail('CLI_TIMEOUT'),12000);
  child.on('message',message=>{if(message?.type==='qloo-attempt'){attempts++;if(attempts>1)fail('CLI_ATTEMPT_LIMIT');}else if(message?.type==='qloo-status'&&Number.isInteger(message.status))httpStatus=message.status;else if(message?.type==='qloo-reject'&&['REQUEST_BLOCKED','FETCH_FAILED','RESPONSE_LIMIT','RESPONSE_READ_FAILED'].includes(message.reason))boundaryReason??=message.reason;else fail('CLI_PROTOCOL');});
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>2097152)fail('CLI_OUTPUT_LIMIT');else chunks.push(chunk);});
  // stderr is bounded and discarded, including any upstream text or credential.
  child.stderr.on('data',chunk=>{errors+=chunk.length;if(errors>16384)fail('CLI_OUTPUT_LIMIT');});
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);error?reject(error):resolve(value);};
  child.on('error',()=>finish(new GuardError(503,'CLI_UNAVAILABLE','公式CLIを起動できません。')));
  child.on('close',(code,terminationSignal)=>{
   const closedError=(errorCode,message)=>Object.assign(new GuardError(502,errorCode,message),{diagnostic:{childClosed:true,exitCode:Number.isInteger(code)?code:null,signal:['SIGKILL','SIGTERM'].includes(terminationSignal)?terminationSignal:null,requestHash:plan.requestHash,physicalAttempts:attempts,httpStatus:httpStatus||null,boundaryReason}});
   if(failure)return finish(closedError(failure,'外部処理を安全に完了できませんでした。自動再送しません。'));
   if(!dryRun&&httpStatus>=400)return finish(null,{status:httpStatus,body:'',diagnostic:{childClosed:true,exitCode:Number.isInteger(code)?code:null,requestHash:plan.requestHash,physicalAttempts:attempts,httpStatus,boundaryReason}});
   if(code!==0||(!dryRun&&attempts!==1))return finish(closedError('CLI_FAILURE','公式CLIの結果を確認できません。自動再送しません。'));
   try{
    const result=JSON.parse(Buffer.concat(chunks).toString());
    if(dryRun){const actual=new URL(result.url);for(const [key,value] of Object.entries(result.params||{}))actual.searchParams.set(key,String(value));actual.searchParams.sort();deny(result.method==='GET'&&hash(actual.toString())===plan.requestHash&&attempts===0,502,'CLI_PLAN_MISMATCH','公式CLIの送信計画が一致しません。');return finish(null,{dryRun:true,version:installation.version,endpoint:OFFICIAL_ORIGIN,query:plan.query,requestHash:plan.requestHash,physicalAttempts:0});}
    deny(Array.isArray(result)&&result.length<=plan.query.take,502,'CLI_RESPONSE_INVALID','候補の件数を確認できません。');
    // Bound the raw CLI envelope separately; only needed metadata crosses the guard.
    const types=['urn:entity:movie','urn:entity:artist','urn:entity:book'];
    const projected=result.map(e=>({entity_id:typeof e?.entity_id==='string'?e.entity_id.slice(0,37):null,name:typeof e?.name==='string'?e.name.slice(0,201):null,subtype:types.includes(e?.subtype)?e.subtype:undefined,types:Array.isArray(e?.types)?e.types.filter(t=>types.includes(t)).slice(0,3):[],properties:{release_year:Number.isInteger(e?.properties?.release_year)?e.properties.release_year:undefined},disambiguation:typeof e?.disambiguation==='string'?e.disambiguation.slice(0,180):undefined}));
    const normalized=parseResponse(JSON.stringify({success:true,results:{entities:projected}}));
    finish(null,{status:httpStatus,diagnostic:{childClosed:true,exitCode:code,requestHash:plan.requestHash,physicalAttempts:attempts,httpStatus,boundaryReason},body:JSON.stringify({success:true,results:{entities:normalized.entities.map(e=>({entity_id:e.id,name:e.title,...(e.kind?{subtype:'urn:entity:'+e.kind}:{}),...(e.detail?{disambiguation:e.detail}:{})}))}})});
   }catch{finish(closedError('CLI_RESPONSE_INVALID','公式CLIの応答形式を確認できません。'));}
  });
 });
 }finally{if(dryHome)rmSync(dryHome,{recursive:true,force:true});}
}
// Only explicit local-test mode wires this transport. Each request still needs
// a fixed query approval, active owner scope and shared room/budget reservation.
export function createCliTransport(approval,runtime={}){return (query,{signal}={})=>runCli(query,{dryRun:false,signal,approval},runtime);}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await runCli({kind:'movie',entities:['10000000-0000-0000-0000-000000000001'],take:1}),null,2));}
 catch{console.error('キー不要の準備確認に失敗しました。内部出力は表示しません。');process.exitCode=1;}
}
