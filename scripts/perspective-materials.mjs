import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {hash,deny,GuardError,snapshotHash,knownExecution,executionDiagnostic} from './security-state.mjs';
import {materialPlan,materialRequest,parseMaterial} from './material-query.mjs';
import {verifyInstallation,credentialStatus,QLOO_HOME_DIR,OFFICIAL_ORIGIN} from './qloo-installation.mjs';
import {baselineHash,materialProjection} from './perspectives.mjs';
const boundary=fileURLToPath(new URL('./qloo-fetch-boundary.mjs',import.meta.url)),childFile=fileURLToPath(new URL('./qloo-material-child.mjs',import.meta.url));
export function launchMaterial(input,{approval,signal,runtime={}}={}){
 const plan=materialRequest(input);deny(approval?.endpoint===OFFICIAL_ORIGIN&&approval.requestHash===plan.requestHash&&Number.isSafeInteger(approval.expires)&&approval.expires>Date.now()&&approval.expires<=Date.now()+900000,423,'MATERIAL_APPROVAL','予約済みの照会が必要です。');verifyInstallation();
 const home=runtime.home||QLOO_HOME_DIR;deny(credentialStatus(home)==='saved-unverified',503,'KEY_REQUIRED','保存済みキーを確認できません。');deny(!signal?.aborted,423,'LIVE_DISABLED','手がかりの取得は停止中です。');
 return new Promise((resolve,reject)=>{
  const child=(runtime.spawn||spawn)(process.execPath,['--import',boundary,childFile,JSON.stringify(plan.query)],{env:{PATH:process.env.PATH,NO_COLOR:'1',QLOO_HOME:home,QLOO_BASE_URL:OFFICIAL_ORIGIN,QLOO_TRUSTED_BASE_URL:OFFICIAL_ORIGIN,CG_QLOO_MODE:'live',CG_QLOO_REQUEST_HASH:plan.requestHash},shell:false,stdio:['ignore','pipe','pipe','ipc']});
  let count=0,status=null,size=0,errors=0,reason=null,failure=null;const chunks=[],kill=code=>{failure??=code;child.kill('SIGKILL');},abort=()=>kill('MATERIAL_ABORT');signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>kill('MATERIAL_TIMEOUT'),12000),clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
  child.on('message',m=>{if(m?.type==='qloo-attempt'){if(++count>1)kill('ATTEMPT_LIMIT');}else if(m?.type==='qloo-status'&&count===1&&status===null&&Number.isInteger(m.status))status=m.status;else if(m?.type==='qloo-reject'&&['REQUEST_BLOCKED','FETCH_FAILED','RESPONSE_LIMIT','RESPONSE_READ_FAILED'].includes(m.reason))reason??=m.reason;else kill('MATERIAL_PROTOCOL');});
  child.stdout.on('data',c=>{size+=c.length;if(size>262144)kill('MATERIAL_LIMIT');else chunks.push(c);});child.stderr.on('data',c=>{errors+=c.length;if(errors>16384)kill('MATERIAL_LIMIT');});
  child.on('error',()=>{clean();reject(new GuardError(503,'MATERIAL_CHILD','手がかりを準備できませんでした。'));});
  child.on('close',code=>{clean();const diagnostic={childClosed:true,exitCode:code,physicalAttempts:count,httpStatus:status,requestHash:plan.requestHash,boundaryReason:reason};const fail=code=>reject(Object.assign(new GuardError(502,code,'取得を停止しました。自動で再送しません。'),{diagnostic}));if(failure||code!==0||count!==1||status!==200)return fail(failure||'MATERIAL_CHILD');try{resolve({data:parseMaterial(Buffer.concat(chunks).toString(),plan.query),diagnostic});}catch{return fail('MATERIAL_RESPONSE');}});
 });
}
import {PerspectiveMaterials as MaterialsCore} from './perspective-materials-core.mjs';
export class PerspectiveMaterials extends MaterialsCore{constructor(state,options={}){super(state,{...options,transport:options.transport||launchMaterial});}}
