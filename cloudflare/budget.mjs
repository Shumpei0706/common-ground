import {randomBytes} from 'node:crypto';
import {SecurityCore,deny,hash,GuardError,executionDiagnostic} from '../scripts/security-core.mjs';
import {OFFICIAL_ORIGIN} from '../scripts/qloo-endpoint.mjs';
const version=value=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
const REVIEW_END=Date.parse('2026-11-06T15:00:00+09:00');
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const reviewKeys=['reviewPolicy','attemptId','room','job','semanticQueryHash','requestHash','diagnostic','diagnosticHash','evidenceHash','frozenSourceHash','reviewedAt','localExecutionStopped','spentSlotRetained','sameJobRetryAllowed','remoteOutcome'];
export function auditOnly(row){
 let value;try{value=typeof row.result==='string'?JSON.parse(row.result):row.result;}catch{}
 const kept={discarded:true};
 if(hex(value?.semanticQueryHash))kept.semanticQueryHash=value.semanticQueryHash;
 if(value?.diagnostic)kept.diagnostic=executionDiagnostic(value.diagnostic);
 if(value?.operatorReview){const v=value.operatorReview;kept.operatorReview=Object.fromEntries(reviewKeys.filter(k=>Object.hasOwn(v,k)).map(k=>[k,k==='diagnostic'?executionDiagnostic(v[k]):v[k]]));}
 return {id:row.id,job:row.job,room:row.room,day:row.day,start:row.start,state:row.state,result:JSON.stringify(kept)};
}
export class CloudState extends SecurityCore{
 constructor(db,{id,origin,baselineHash,versionId=null,now=()=>Date.now()}={}){
  super(db,{filename:'cloudflare:'+id,now,binding:()=>hash(JSON.stringify({id,origin,baselineHash}))});
  this.objectId=id;this.origin=origin;this.expectedBaselineHash=baselineHash;this.versionId=version(versionId)?versionId:null;this.bootNonce=randomBytes(32).toString('hex');
  // Explicit invited-review permission survives same-version eviction only.
  // Restore/rollback operations must stop first and reconcile the external floor.
  const p=this.policy(),a=p.publicBetaAuthorization;
  const persistent=a?.mode==='invited-review'&&this.livePermitted(p)&&!this.db.prepare("SELECT id,job,room,state,start,result FROM attempts WHERE state IN ('started','unknown','failed')").all().some(row=>row.state==='failed'?row.start>=a.armedAt:!this.reviewedExecution(row));
  if((p.enabled||a)&&!persistent)this.configure({enabled:false,confirmedFree:false,publicBetaAuthorization:null});
  // Remove expired rate history before building the new time index on old data.
  // No attempt/session/room history is removed by this startup step.
  this.db.prepare('DELETE FROM creation_events WHERE time<=?').run(this.now()-3600000);
  this.db.exec("CREATE INDEX IF NOT EXISTS attempts_room ON attempts(room); CREATE INDEX IF NOT EXISTS attempts_day ON attempts(day); CREATE INDEX IF NOT EXISTS attempts_state ON attempts(state); CREATE INDEX IF NOT EXISTS creation_events_session_time ON creation_events(session,time); CREATE INDEX IF NOT EXISTS creation_events_time ON creation_events(time); CREATE INDEX IF NOT EXISTS rooms_expires ON rooms(expires); CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires); CREATE INDEX IF NOT EXISTS grants_expires ON grants(expires); CREATE INDEX IF NOT EXISTS grants_revoked ON grants(room) WHERE revoked=1; CREATE INDEX IF NOT EXISTS attempts_pending_scrub ON attempts(room) WHERE CASE WHEN json_valid(result) THEN json_extract(result,'$.discarded') IS NOT 1 ELSE 1 END;");
 }
 livePermitted(p=this.policy()){
  const a=p.publicBetaAuthorization,m=p.cloudImport,mode=a?.mode??'session',persistent=mode==='invited-review';
  const runtime=persistent?version(this.versionId)&&a?.versionId===this.versionId:mode==='session'&&a?.runtimeNonce===this.bootNonce;
  return p.enabled===true&&p.confirmedFree===false&&hex(this.expectedBaselineHash)&&m?.manifestHash===this.expectedBaselineHash&&m.objectId===this.objectId&&m.origin===this.origin&&this.bindingMatches(p)&&runtime&&a.endpoint===OFFICIAL_ORIGIN&&a.origin===this.origin&&a.ledgerId===p.betaSecurity?.ledgerId&&Number.isSafeInteger(a.absoluteCeiling)&&a.absoluteCeiling>0&&a.absoluteCeiling<=(persistent?477:1000)&&Number.isSafeInteger(a.armedAt)&&a.armedAt<=this.now()&&Number.isSafeInteger(a.expiresAt)&&a.expiresAt>this.now()&&a.expiresAt<=a.armedAt+(persistent?21*86400000:7200000)&&(!persistent||a.expiresAt<=REVIEW_END);
 }
 usage(room){const use=super.usage(room);return this.policy().cloudImport?use:{...use,total:Math.max(214,use.total)};}
 // Display counters may lag up to60s; authorization/reserve/arm always use usage().
 displayUsage(room){
  const now=this.now(),day=new Date(now).toISOString().slice(0,10);this.displayCounts??=new Map();
  const old=this.displayCounts.get(room);
  if(old&&old.day===day&&now>=old.at&&now-old.at<60000)return {...old.value};
  const value=this.usage(room);if(this.displayCounts.size>=100)this.displayCounts.clear();
  this.displayCounts.set(room,{at:now,day,value});return {...value};
 }
 reserve(...args){const result=super.reserve(...args);if(!result.cached)this.displayCounts?.clear();return result;}

 importBudget(manifest){return this.transaction(()=>{
  const p=this.policy();if(p.enabled||p.cloudImport||this.db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n!==0)throw new GuardError(409,'IMPORT_ALREADY_BOUND','This ledger cannot be replaced or reset.');
  const manifestHash=hash(JSON.stringify(manifest));
  deny(hex(this.expectedBaselineHash)&&manifestHash===this.expectedBaselineHash,403,'IMPORT_HASH_REQUIRED','Bind the verified baseline hash before import.');
  deny(manifest&&manifest.version===1&&manifest.targetOrigin===this.origin&&manifest.targetObjectId===this.objectId&&manifest.localRetired===true&&typeof manifest.sourceLedgerId==='string'&&/^[A-Za-z0-9_-]{43}$/.test(manifest.sourceLedgerId)&&hex(manifest.sourceBindingHash)&&Number.isSafeInteger(manifest.sourceFrozenAt)&&manifest.sourceFrozenAt>0&&manifest.sourceFrozenAt<=this.now()&&Array.isArray(manifest.attempts)&&manifest.attempts.length===manifest.sourceSpent&&manifest.sourceSpent>=214&&manifest.sourceSpent<=1000,400,'IMPORT_INVALID','A verified source ledger for this exact object is required.');
  const ids=new Set(),jobs=new Set();
  for(const row of manifest.attempts){
   deny(row&&Number.isSafeInteger(row.id)&&row.id>0&&!ids.has(row.id)&&hex(row.job)&&!jobs.has(row.job)&&typeof row.room==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(row.room)&&/^\d{4}-\d{2}-\d{2}$/.test(row.day)&&Number.isSafeInteger(row.start)&&row.start>0&&row.start<=manifest.sourceFrozenAt&&new Date(row.start).toISOString().slice(0,10)===row.day&&['success','failed','unknown'].includes(row.state),400,'IMPORT_INVALID','Invalid historical attempt.');
   const safe=auditOnly(row);deny(JSON.stringify(safe)===JSON.stringify(row),400,'IMPORT_CONTENT_REJECTED','Historical content must be removed before import.');
   if(row.state==='unknown'&&!this.reviewedExecution(row))throw new GuardError(409,'IMPORT_UNKNOWN_EXECUTION','Review every uncertain execution before import.');
   ids.add(row.id);jobs.add(row.job);this.db.prepare('INSERT INTO attempts(id,job,room,day,start,state,result) VALUES (?,?,?,?,?,?,?)').run(row.id,row.job,row.room,row.day,row.start,row.state,row.result);
  }
  this.displayCounts?.clear();
  this.configure({enabled:false,confirmedFree:false,total:1000,daily:200,room:30,localTestAuthorization:null,publicBetaAuthorization:null,liveLedgerBinding:this.ledgerBinding(),cloudImport:{version:1,manifestHash,objectId:this.objectId,origin:this.origin,sourceLedgerId:manifest.sourceLedgerId,sourceSpent:manifest.sourceSpent,importedAt:this.now()}});
  return this.operatorStatus();
 });}
 operatorStatus(){const p=this.policy();return {objectId:this.objectId,origin:this.origin,ledgerId:p.betaSecurity?.ledgerId,bootNonce:this.bootNonce,versionId:this.versionId,activationMode:p.publicBetaAuthorization?.mode??'session',imported:!!p.cloudImport,manifestHash:p.cloudImport?.manifestHash||null,baselineSpent:p.cloudImport?.sourceSpent??null,used:this.usage(''),enabled:this.livePermitted(),ceiling:p.total,expiresAt:p.publicBetaAuthorization?.expiresAt||null,unsettled:this.db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE state='started'").get().n+this.db.prepare("SELECT id,job,room,state,result FROM attempts WHERE state='unknown'").all().filter(r=>!this.reviewedExecution(r)).length};}
 arm({confirmation,bootNonce,manifestHash,observedSpent,observedDaily,ceiling=1000,daily=200,room=30,expiresAt,mode='session',versionId=null}={}){return this.transaction(()=>{
  const status=this.operatorStatus(),p=this.policy();
  deny(confirmation==='ARM_CLOUD_QLOO_CUMULATIVE_1000'&&bootNonce===this.bootNonce&&hex(manifestHash)&&manifestHash===this.expectedBaselineHash&&manifestHash===p.cloudImport?.manifestHash&&status.imported&&status.unsettled===0,423,'ARM_REVIEW_REQUIRED','Verify this activation, imported ledger and stopped executions.');
  deny(observedSpent===status.used.total&&observedDaily===status.used.daily,409,'EXTERNAL_FLOOR_MISMATCH','Externally recorded cumulative and daily usage must match; never rearm a restored lower ledger.');
  const persistent=mode==='invited-review';
  deny(['session','invited-review'].includes(mode)&&(!persistent||version(this.versionId)&&versionId===this.versionId),400,'BUDGET_INVALID','A current server version is required for invited review.');
  deny(Number.isSafeInteger(ceiling)&&ceiling>status.used.total&&ceiling<=(persistent?477:1000)&&Number.isInteger(daily)&&daily>=1&&daily<=200&&Number.isInteger(room)&&room>=1&&room<=30&&Number.isSafeInteger(expiresAt)&&expiresAt>this.now()&&expiresAt<=this.now()+(persistent?21*86400000:7200000)&&(!persistent||expiresAt<=REVIEW_END),400,'BUDGET_INVALID','Finite cumulative ceiling and a bounded activation window are required.');
  this.configure({enabled:true,confirmedFree:false,total:ceiling,daily,room,publicBetaAuthorization:{endpoint:OFFICIAL_ORIGIN,origin:this.origin,absoluteCeiling:ceiling,expiresAt,armedAt:this.now(),runtimeNonce:this.bootNonce,ledgerId:p.betaSecurity.ledgerId,mode,...(mode==='invited-review'?{versionId:this.versionId}:{})}});return this.operatorStatus();
 });}
}
