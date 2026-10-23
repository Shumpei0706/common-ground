import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
export const STATE_PATH='./.common-ground/private/runtime.sqlite';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export class GuardError extends Error { constructor(status,code,message){super(message);this.status=status;this.code=code;} }
export const deny=(ok,status,code,message)=>{if(!ok)throw new GuardError(status,code,message);};
export function executionDiagnostic(v){if(!v||typeof v!=='object')return null;return {...(v.transportKind==='fetch'?{transportKind:'fetch',transportClosed:v.transportClosed===true}:{}),childClosed:v.childClosed===true,physicalAttempts:Number.isInteger(v.physicalAttempts)&&v.physicalAttempts>=0&&v.physicalAttempts<=2?v.physicalAttempts:null,httpStatus:Number.isInteger(v.httpStatus)&&v.httpStatus>=200&&v.httpStatus<=599?v.httpStatus:null,requestHash:/^[a-f0-9]{64}$/.test(v.requestHash||'')?v.requestHash:null,exitCode:Number.isInteger(v.exitCode)?v.exitCode:null,boundaryReason:['REQUEST_BLOCKED','FETCH_FAILED','RESPONSE_LIMIT','RESPONSE_READ_FAILED'].includes(v.boundaryReason)?v.boundaryReason:null,...(['SIGKILL','SIGTERM'].includes(v.signal)?{signal:v.signal}:{})};}
export const knownExecution=(d,requestHash)=>(d?.childClosed===true||d?.transportKind==='fetch'&&d.transportClosed===true)&&d.physicalAttempts===1&&Number.isInteger(d.httpStatus)&&d.httpStatus>=200&&d.httpStatus<=599&&d.boundaryReason!=='FETCH_FAILED'&&/^[a-f0-9]{64}$/.test(d.requestHash||'')&&(!requestHash||d.requestHash===requestHash);
export const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
// Preserve only minimal no-retry audit hashes after room content expires.
export const STOPPED_EXECUTION=null;
export const STOPPED_EXECUTIONS=[];
const matchesStopped=(row,v)=>{const fixed=STOPPED_EXECUTIONS.find(x=>x.attemptId===row?.id);return !!fixed&&row.room===fixed.room&&Object.entries(fixed).filter(([k])=>k!=='attemptId').every(([k,x])=>v?.[k]===x)&&/^[a-f0-9]{64}$/.test(v?.evidenceHash||'')&&v.remoteOutcome==='unknown';};
const DEFAULT_POLICY={enabled:false,confirmedFree:false,total:1,daily:1,room:1,intervalMs:1000,sessionHours:24};
export class SecurityCore {
 constructor(db,{now=()=>Date.now(),filename=':memory:',fresh=false,binding=null}={}){this.now=now;this.filename=filename;this.fresh=fresh;this.db=db;this.binding=binding;
  this.db.exec(`CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), policy TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL, data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS grants (room TEXT PRIMARY KEY, snapshot TEXT NOT NULL, expires INTEGER NOT NULL, cap INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL UNIQUE, room TEXT NOT NULL, day TEXT NOT NULL, start INTEGER NOT NULL, state TEXT NOT NULL, result TEXT);
   CREATE TABLE IF NOT EXISTS creation_events (session TEXT NOT NULL, time INTEGER NOT NULL);`);
  this.db.prepare('INSERT OR IGNORE INTO config VALUES (1,?)').run(JSON.stringify(DEFAULT_POLICY));
 }
 maximumTotal(){return 1000;}
 reviewInviteDeadline(issuedAt){return issuedAt+21*86400000;}
 transaction(fn){
  // Nested synchronous domain operations join the outer atomic transaction.
  // SQLite BEGIN cannot be nested; the outermost operation owns commit/rollback.
  if(this.transactionDepth)return fn();
  this.transactionDepth=1;
  try{if(this.db.transactionSync)return this.db.transactionSync(fn);this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){try{this.db.exec('ROLLBACK');}catch{}throw e;}}
  finally{this.transactionDepth=0;}
 }
 policy(){const row=this.db.prepare('SELECT policy FROM config WHERE id=1').get();deny(row,503,'LEDGER_POLICY','安全設定を確認できません。');let p;try{p=JSON.parse(row.policy);}catch{throw new GuardError(503,'LEDGER_POLICY','安全設定を確認できません。');}
  deny(typeof p.enabled==='boolean'&&typeof p.confirmedFree==='boolean'&&[p.total,p.daily,p.room,p.intervalMs,p.sessionHours].every(v=>Number.isSafeInteger(v)&&v>0)&&p.total<=this.maximumTotal()&&p.daily<=200&&p.room<=30&&p.intervalMs>=1000&&p.sessionHours<=24,503,'LEDGER_POLICY','安全設定が範囲外です。');return p;}
 configure(update){return this.transaction(()=>{const p={...this.policy(),...update};const old=this.db.prepare('SELECT policy FROM config WHERE id=1').get().policy;this.db.prepare('UPDATE config SET policy=? WHERE id=1').run(JSON.stringify(p));try{this.policy();}catch(e){this.db.prepare('UPDATE config SET policy=? WHERE id=1').run(old);throw e;}return p;});}
 session(cookie){if(!/^[a-f0-9]{64}$/.test(cookie||''))return null;const row=this.db.prepare('SELECT digest,csrf,expires FROM sessions WHERE digest=? AND expires>?').get(hash(cookie),this.now());return row||null;}
 issue(existing,{provisional=false}={}){const old=this.session(existing);if(old)return {session:old,cookie:null};return this.transaction(()=>{
  this.db.prepare('DELETE FROM sessions WHERE expires<=?').run(this.now());
  let count=this.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;
  if(provisional&&count>=1000){
   // Protect all room-bound identities. A flood of anonymous tickets must not
   // prevent an invited browser from obtaining its first ticket.
   const bound=new Set();for(const row of this.db.prepare('SELECT owner,data FROM rooms WHERE expires>?').all(this.now())){const room=JSON.parse(row.data);for(const digest of [row.owner,...(room.hostSessions||[]),...(room.members||[]).map(m=>m.browser),...(room.beta?.admissions||[])])if(digest)bound.add(digest);}
   let victim=null,after=0;
   // Keyset batches stop at the first unbound ticket instead of reading all1000.
   while(!victim){const batch=this.db.prepare('SELECT rowid AS cursor,digest FROM sessions WHERE rowid>? ORDER BY rowid LIMIT 32').all(after);if(!batch.length)break;victim=batch.find(x=>!bound.has(x.digest))||null;after=batch.at(-1).cursor;}
   if(victim){this.db.prepare('DELETE FROM sessions WHERE digest=?').run(victim.digest);count--;}
  }
  deny(count<1000,429,'SESSION_LIMIT','新規参加の受付を一時停止しています。');
  const cookie=randomBytes(32).toString('hex'),session={digest:hash(cookie),csrf:randomBytes(32).toString('hex'),expires:this.now()+(provisional?600000:this.policy().sessionHours*3600000)};
  this.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(session.digest,session.csrf,session.expires);return {session,cookie};
 });}
 extendSession(session,expires){
  deny(session?.digest&&Number.isSafeInteger(expires)&&expires>this.now()&&expires<=this.now()+7200000,400,'SESSION_INVALID','Invalid session renewal.');
  this.db.prepare('UPDATE sessions SET expires=MAX(expires,?) WHERE digest=? AND expires>?').run(expires,session.digest,this.now());
  return this.db.prepare('SELECT expires FROM sessions WHERE digest=? AND expires>?').get(session.digest,this.now())?.expires;
 }
 ledgerBinding(){deny(typeof this.binding==='function',503,'LEDGER_BINDING_REQUIRED','Use a bound durable ledger.');return this.binding();}
 bindLiveLedger(){if(this.policy().cloudRetirement)throw new GuardError(423,'LEDGER_RETIRED','This local ledger was retired to Cloudflare.');const binding=this.ledgerBinding(),old=this.policy().liveLedgerBinding;deny(!old||old===binding,503,'LEDGER_BINDING_REQUIRED','A copied or relocated ledger cannot authorize live calls.');return this.configure({liveLedgerBinding:binding});}
 bindingMatches(p=this.policy()){return this.filename===':memory:'||p.liveLedgerBinding===this.ledgerBinding();}
 discardAttempts(room){
  for(const row of this.db.prepare('SELECT id,result FROM attempts WHERE room=?').all(room)){let v;try{v=JSON.parse(row.result);}catch{}const kept={discarded:true};if(v?.operatorReview)kept.operatorReview=v.operatorReview;if(/^[a-f0-9]{64}$/.test(v?.semanticQueryHash||''))kept.semanticQueryHash=v.semanticQueryHash;if(v?.diagnostic)kept.diagnostic=executionDiagnostic(v.diagnostic);const serialized=JSON.stringify(kept);if(serialized!==row.result)this.db.prepare('UPDATE attempts SET result=? WHERE id=?').run(serialized,row.id);}
 }
 forget(session){this.db.prepare('DELETE FROM sessions WHERE digest=?').run(session.digest);}
 saveRoom(room){const expires=room.created+7200000;this.db.prepare('INSERT INTO rooms VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,expires=excluded.expires').run(room.id,room.browserOwner||'',expires,JSON.stringify(room));}
 loadRoom(id){const row=this.db.prepare('SELECT data FROM rooms WHERE id=? AND expires>?').get(id,this.now());deny(row,404,'ROOM_MISSING','ルームが見つからないか、期限が切れています。');return JSON.parse(row.data);}
 mutateRoom(id,fn){return this.transaction(()=>{const r=this.loadRoom(id);const result=fn(r);this.saveRoom(r);return result;});}
 sweep(){
  this.db.prepare('DELETE FROM creation_events WHERE time<=?').run(this.now()-3600000);
  this.db.prepare('DELETE FROM rooms WHERE expires<=?').run(this.now());
  this.db.prepare('DELETE FROM sessions WHERE expires<=?').run(this.now());
  this.db.prepare('DELETE FROM grants WHERE expires<=? OR room NOT IN (SELECT id FROM rooms)').run(this.now());
  // Content expires, while spent attempts remain in the budget ledger.
  for(const row of this.db.prepare("SELECT DISTINCT room FROM attempts WHERE CASE WHEN json_valid(result) THEN json_extract(result,'$.discarded') IS NOT 1 ELSE 1 END AND (room NOT IN (SELECT id FROM rooms) OR room IN (SELECT room FROM grants WHERE revoked=1))").all())this.discardAttempts(row.room);
 }
 loadRooms(){this.sweep();return this.db.prepare('SELECT data FROM rooms').all().map(row=>JSON.parse(row.data));}
 creation(session){return this.transaction(()=>{this.db.prepare('DELETE FROM creation_events WHERE time<?').run(this.now()-3600000);const n=this.db.prepare('SELECT COUNT(*) AS n FROM creation_events WHERE session=? AND time>?').get(session.digest,this.now()-60000).n;deny(n<5,429,'CREATE_LIMIT','ルーム作成は1分に5つまでです。');const total=this.db.prepare("SELECT COUNT(*) AS n FROM creation_events WHERE session NOT LIKE 'beta:%' AND time>?").get(this.now()-60000).n;deny(total<30,429,'CREATE_LIMIT','新しいルームの受付を一時停止しています。');this.db.prepare('INSERT INTO creation_events VALUES (?,?)').run(session.digest,this.now());});}
 grant(room,snapshot,{cap=1,expires=this.now()+3600000}={}){
  deny(Number.isInteger(cap)&&cap>0&&cap<=30&&typeof snapshot==='string'&&/^[a-f0-9]{64}$/.test(snapshot)&&expires>this.now()&&expires<=this.now()+7200000,400,'GRANT_INVALID','利用許可の条件が不正です。');
  deny(this.db.prepare('SELECT id FROM rooms WHERE id=? AND expires>?').get(room,this.now()),404,'ROOM_MISSING','有効なルームが見つかりません。');
  this.db.prepare('INSERT INTO grants(room,snapshot,expires,cap,revoked) VALUES (?,?,?,?,0) ON CONFLICT(room) DO UPDATE SET snapshot=excluded.snapshot,expires=excluded.expires,cap=excluded.cap,revoked=0').run(room,snapshot,expires,cap);
 }
 revoke(room){this.db.prepare('UPDATE grants SET revoked=1 WHERE room=?').run(room);this.discardAttempts(room);}
 stop(){this.configure({enabled:false});}
 usage(room){const day=new Date(this.now()).toISOString().slice(0,10);return {total:this.db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n,daily:this.db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE day=?').get(day).n,room:this.db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE room=?').get(room).n};}
 livePermitted(p=this.policy()){if(p.cloudRetirement)return false;const a=p.publicBetaAuthorization||p.localTestAuthorization;return this.bindingMatches(p)&&p.enabled&&(p.confirmedFree||!!a&&a.endpoint==='https://hackathon.api.qloo.com'&&Number.isSafeInteger(a.absoluteCeiling)&&a.absoluteCeiling>0&&a.absoluteCeiling<=500&&Number.isSafeInteger(a.expiresAt)&&a.expiresAt>this.now()&&(!p.publicBetaAuthorization||typeof a.origin==='string'&&a.origin.startsWith('https://')));}
 authorizationAllowsRoom(room,p=this.policy()){const rooms=p.localTestAuthorization?.rooms;return rooms===undefined||Array.isArray(rooms)&&rooms.length<=100&&rooms.every(id=>typeof id==='string'&&/^[A-F0-9]{6}$/.test(id))&&rooms.includes(room);}
 displayUsage(room){return this.usage(room);}
 status(room,snapshot){const p=this.policy(),g=this.db.prepare('SELECT snapshot,expires,cap,revoked FROM grants WHERE room=?').get(room),usage=this.displayUsage(room);return {enabled:this.livePermitted(p),allowed:this.authorizationAllowsRoom(room,p)&&!!g&&!g.revoked&&g.expires>this.now()&&g.snapshot===snapshot&&this.matchesRoom(room,snapshot),limits:{total:Math.min(p.total,p.publicBetaAuthorization?.absoluteCeiling??p.localTestAuthorization?.absoluteCeiling??p.total),daily:p.daily,room:Math.min(p.room,g?.cap||p.room)},used:usage};}
 matchesRoom(room,snapshot){const row=this.db.prepare('SELECT data FROM rooms WHERE id=? AND expires>?').get(room,this.now());return !!row&&snapshotHash(JSON.parse(row.data))===snapshot;}
 reviewedExecution(row){
  if(row.state!=='unknown'||!row.result)return null;try{const value=JSON.parse(row.result).operatorReview;return (matchesStopped(row,value)||value?.reviewPolicy==='closed-no-retry-v1'&&value.attemptId===row.id&&value.room===row.room&&value.diagnosticHash===hash(JSON.stringify(value.diagnostic))&&value.diagnostic?.childClosed===true&&[0,1].includes(value.diagnostic?.physicalAttempts)&&/^[a-f0-9]{64}$/.test(value.diagnostic?.requestHash||''))&&value?.localExecutionStopped===true&&value.spentSlotRetained===true&&value.sameJobRetryAllowed===false&&value.job===row.job&&/^[a-f0-9]{64}$/.test(value.semanticQueryHash||'')?value:null;}catch{return null;}
 }
 blockedQuery(semanticQueryHash){
  if(!/^[a-f0-9]{64}$/.test(semanticQueryHash||''))return false;
  return this.db.prepare("SELECT id,room,state,job,result FROM attempts WHERE result IS NOT NULL AND state IN ('failed','unknown')").all().some(row=>{const reviewed=this.reviewedExecution(row);if(reviewed)return reviewed.semanticQueryHash===semanticQueryHash;try{const value=JSON.parse(row.result);return row.state==='failed'&&value.semanticQueryHash===semanticQueryHash&&(value.diagnostic?.childClosed===true&&value.diagnostic?.physicalAttempts===1||value.diagnostic?.transportKind==='fetch'&&knownExecution(executionDiagnostic(value.diagnostic)));}catch{return false;}});
 }
 annotateFailedQuery(id,{room,snapshot,query,requestHash}){return this.transaction(()=>{
  deny(!this.policy().enabled,423,'STOP_REQUIRED','実APIを停止してください。');const row=this.db.prepare('SELECT * FROM attempts WHERE id=?').get(id);let value;try{value=JSON.parse(row?.result);}catch{}
  deny(row?.state==='failed'&&row.room===room&&this.matchesRoom(room,snapshot)&&row.job===hash(JSON.stringify({room,snapshot,query,version:1}))&&value?.diagnostic?.childClosed===true&&value.diagnostic.physicalAttempts===1&&value.diagnostic.requestHash===requestHash&&!value.semanticQueryHash,409,'FAILURE_IDENTITY_INVALID','終了済みの照会を確認できません。');
  this.db.prepare('UPDATE attempts SET result=? WHERE id=?').run(JSON.stringify({...value,semanticQueryHash:hash(JSON.stringify(query))}),id);return {attemptId:id,state:'failed',spentSlotRetained:true};
 });}
 acknowledgeStoppedExecution(id,review){return this.transaction(()=>{
  deny(!this.policy().enabled,423,'STOP_REQUIRED','実APIを停止してください。');const row=this.db.prepare('SELECT id,job,room,state,result,start FROM attempts WHERE id=?').get(id);
  deny(matchesStopped(row,review)&&row?.state==='unknown'&&row.result===null&&row.job===review.job&&row.room===review.room&&this.now()-row.start>=15000&&review.localExecutionStopped===true&&review.spentSlotRetained===true&&review.sameJobRetryAllowed===false&&/^[a-f0-9]{64}$/.test(review.semanticQueryHash||''),409,'EXECUTION_REVIEW_INVALID','停止した実行と最小限の証拠を確認してください。');
  this.db.prepare("UPDATE attempts SET result=? WHERE id=? AND state='unknown' AND result IS NULL").run(JSON.stringify({operatorReview:Object.fromEntries(['job','room','semanticQueryHash','requestHash','evidenceHash','frozenSourceHash','reviewedAt','localExecutionStopped','spentSlotRetained','sameJobRetryAllowed','remoteOutcome'].map(k=>[k,review[k]]))}),id);return {attemptId:id,state:'unknown',spentSlotRetained:true,sameJobRetryAllowed:false};
 });}
 acknowledgeClosedExecution(id,{confirmation,evidenceHash,requestHash}={}){return this.transaction(()=>{
  deny(!this.policy().enabled&&confirmation==='REVIEW_CLOSED_EXECUTION_NO_RETRY'&&/^[a-f0-9]{64}$/.test(evidenceHash||''),423,'EXECUTION_REVIEW_REQUIRED','Stop API and review the closed execution without retry.');
  const row=this.db.prepare('SELECT id,room,state,job,result FROM attempts WHERE id=?').get(id);let v;try{v=JSON.parse(row?.result);}catch{}const d=v?.diagnostic;
  deny(row?.state==='unknown'&&d?.childClosed===true&&[0,1].includes(d.physicalAttempts)&&/^[a-f0-9]{64}$/.test(d.requestHash||'')&&d.requestHash===requestHash&&/^[a-f0-9]{64}$/.test(v?.semanticQueryHash||''),409,'EXECUTION_REVIEW_INVALID','Stored child-closure proof and exact request identity are required.');
  const operatorReview={reviewPolicy:'closed-no-retry-v1',attemptId:id,room:row.room,job:row.job,semanticQueryHash:v.semanticQueryHash,diagnostic:d,diagnosticHash:hash(JSON.stringify(d)),evidenceHash,reviewedAt:new Date(this.now()).toISOString(),localExecutionStopped:true,spentSlotRetained:true,sameJobRetryAllowed:false,remoteOutcome:'unknown'};
  this.db.prepare('UPDATE attempts SET result=? WHERE id=?').run(JSON.stringify({discarded:true,operatorReview}),id);return {attemptId:id,spentSlotRetained:true,sameJobRetryAllowed:false,apiEnabled:false};
 });}
 reserve(room,snapshot,job,semanticQueryHash=null,relatedQueryHashes=[]){return this.transaction(()=>{
  const p=this.policy();deny(this.livePermitted(p),423,'LIVE_DISABLED','実APIは停止中です。利用条件の確認と所有者の許可が必要です。');
  const g=this.db.prepare('SELECT * FROM grants WHERE room=?').get(room);deny(this.authorizationAllowsRoom(room,p)&&g&&!g.revoked&&g.expires>this.now()&&g.snapshot===snapshot&&this.matchesRoom(room,snapshot),403,'ROOM_NOT_ALLOWED','この入力版には実APIの利用許可がありません。');
  const old=this.db.prepare('SELECT * FROM attempts WHERE job=?').get(job);if(old){if(old.state==='success'){deny(old.result&&!JSON.parse(old.result).discarded,409,'RESULT_REMOVED','This cached result was removed. It will not be requested again.');return {cached:true,result:JSON.parse(old.result)};}throw new GuardError(409,'JOB_ALREADY_ATTEMPTED','この探索は実行済み、または結果不明です。自動で再送しません。');}
  const usage=this.usage(room);deny(usage.total<Math.min(p.total,p.publicBetaAuthorization?.absoluteCeiling??p.localTestAuthorization?.absoluteCeiling??p.total)&&usage.daily<p.daily&&usage.room<Math.min(p.room,g.cap),429,'BUDGET_EXHAUSTED','実APIの停止上限に達しました。');
  const unsettled=this.db.prepare("SELECT id,room,state,job,result FROM attempts WHERE state IN ('started','unknown')").all();deny(!unsettled.some(row=>!this.reviewedExecution(row)),409,'IN_FLIGHT','実行中または結果不明のAPI処理があります。新しい通信は開始しません。');
  deny(!this.db.prepare("SELECT 1 FROM attempts WHERE result IS NOT NULL AND state IN ('failed','unknown') AND CASE WHEN json_valid(result) THEN json_type(result,'$.semanticQueryHash')='text' OR json_extract(result,'$.operatorReview.localExecutionStopped')=1 ELSE 0 END LIMIT 1").get()||/^[a-f0-9]{64}$/.test(semanticQueryHash||''),400,'QUERY_IDENTITY_REQUIRED','再送禁止条件を確認できません。');deny(Array.isArray(relatedQueryHashes)&&relatedQueryHashes.length<=10&&relatedQueryHashes.every(h=>/^[a-f0-9]{64}$/.test(h)),400,'QUERY_IDENTITY_REQUIRED','関連する照会を確認できません。');deny(!this.blockedQuery(semanticQueryHash)&&!relatedQueryHashes.some(h=>this.blockedQuery(h)),409,'QUERY_ABANDONED','この照会は結果未確認または失敗のため、別ルームからも再送しません。');
  const last=this.db.prepare('SELECT MAX(start) AS time FROM attempts').get().time;deny(last==null||this.now()-last>=p.intervalMs,429,'START_INTERVAL','APIの開始間隔を空けてください。');
  const day=new Date(this.now()).toISOString().slice(0,10);const result=this.db.prepare("INSERT INTO attempts(job,room,day,start,state) VALUES (?,?,?,?,'started')").run(job,room,day,this.now());return {cached:false,id:Number(result.lastInsertRowid)};
 });}
 // Local owner CLI only. One explicit smoke authorization does not assert free
 // usage or enable workshop traffic. The shared durable ledger counts it forever.
 reserveSmoke(job){if(this.policy().cloudRetirement)throw new GuardError(423,'LEDGER_RETIRED','This local ledger was retired to Cloudflare.');deny(!this.policy().enabled,423,'SMOKE_REQUIRES_STOP','Stop API traffic before a smoke test.');if(this.filename!==':memory:')this.bindLiveLedger();return this.transaction(()=>{
  deny(typeof job==='string'&&/^[a-f0-9]{64}$/.test(job),400,'SMOKE_INVALID','テスト条件が不正です。');
  const p=this.policy();deny(!p.enabled,423,'SMOKE_REQUIRES_STOP','アプリの実APIを停止してから確認してください。');
  deny(this.usage('').total===0,429,'SMOKE_ALREADY_SPENT','The first-request smoke slot is already spent.');
  deny(this.usage('').total<500&&this.usage('').daily<200,429,'BUDGET_EXHAUSTED','The cumulative or daily ceiling has been reached.');deny(!this.db.prepare("SELECT id,room,state,job,result FROM attempts WHERE state IN ('started','unknown')").all().some(r=>!this.reviewedExecution(r)),409,'IN_FLIGHT','An earlier execution must be checked first.');
  const day=new Date(this.now()).toISOString().slice(0,10);
  const result=this.db.prepare("INSERT INTO attempts(job,room,day,start,state) VALUES (?,'LOCAL_SMOKE',?,?,'started')").run(job,day,this.now());
  return {id:Number(result.lastInsertRowid)};
 });}
 stillAllowed(room,snapshot){return this.status(room,snapshot).enabled&&this.status(room,snapshot).allowed;}
 finish(id,state,result=null){deny(['success','failed','unknown'].includes(state),400,'STATE_INVALID','処理状態が不正です。');const old=this.db.prepare('SELECT result FROM attempts WHERE id=? AND state=?').get(id,'started');let v;try{v=JSON.parse(old?.result);}catch{}if(v?.discarded)result={discarded:true,...(result?.diagnostic?{diagnostic:executionDiagnostic(result.diagnostic)}:{}),...(/^[a-f0-9]{64}$/.test(result?.semanticQueryHash||'')?{semanticQueryHash:result.semanticQueryHash}:{})};this.db.prepare('UPDATE attempts SET state=?,result=? WHERE id=? AND state=?').run(state,result?JSON.stringify(result):null,id,'started');}
 close(){this.db.close();}
}
export function snapshotHash(room){return hash(JSON.stringify(room.snapshot.map(p=>({id:p.id,items:p.items.map(i=>({id:i.id,external:i.externalConsent===true}))}))));}
