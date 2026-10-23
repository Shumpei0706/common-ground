import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {SocketAddress} from 'node:net';
import {readFileSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {deny,hash,same,snapshotHash,STATE_PATH} from './security-core.mjs';
import {hasHostAccess} from './perspectives.mjs';
import {OFFICIAL_ORIGIN,QLOO_HOME_DIR} from './qloo-installation.mjs';
export const POLICY_VERSION='2026-10-21-beta-1';
const token=()=>randomBytes(32).toString('base64url');
const validToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const usableReviewInvite=(v,now,deadline)=>v&&Number.isSafeInteger(v.issuedAt)&&Number.isSafeInteger(v.expires)&&v.expires>now&&v.issuedAt<=now&&v.expires<=deadline&&Number.isInteger(v.maxRooms)&&v.maxRooms>=1&&v.maxRooms<=12&&Number.isInteger(v.usedRooms)&&v.usedRooms>=0&&v.usedRooms<v.maxRooms;
const loopback=ip=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip);
const cleanText=(v,max=200)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\x00-\x1f\x7f<>]/.test(v)&&!/REPLACE|TODO|example\.(com|org)|未設定/i.test(v);
export function validateDeployment(input,{preview=false}={}){
 deny(input&&typeof input==='object'&&!Array.isArray(input),503,'DEPLOYMENT_INVALID','Deployment configuration is required.');
 if(preview)return {...input,preview:true,publicOrigin:null,operatorName:'Local development preview',contact:'Not configured for public use',hostingProvider:'Local Mac',hostingRegion:'Local development',logRetentionDays:0,backupRetentionDays:0};
 let url;try{url=new URL(input.publicOrigin);}catch{}
 deny(url&&url.protocol==='https:'&&url.origin===input.publicOrigin&&url.hostname.includes('.')&&!url.username&&!url.password&&!isIP(url.hostname)&&!url.hostname.endsWith('.localhost')&&!url.hostname.endsWith('.example')&&!url.hostname.startsWith('example.'),503,'DEPLOYMENT_INVALID','An exact HTTPS public origin is required.');
 for(const key of ['operatorName','hostingProvider','hostingRegion'])deny(cleanText(input[key]),503,'DEPLOYMENT_INVALID','Complete operator and hosting details before public use.');
 deny(cleanText(input.contact)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact),503,'DEPLOYMENT_INVALID','A contact email is required.');
 for(const key of ['logRetentionDays','backupRetentionDays'])deny(Number.isInteger(input[key])&&input[key]>=0&&input[key]<=30,503,'DEPLOYMENT_INVALID','Configure bounded hosting retention.');
 deny(input.reviewedPolicyVersion===POLICY_VERSION&&input.hostingControlsVerified===true&&input.edgeControlsVerified===true,503,'RELEASE_REVIEW_REQUIRED','Operator policy, hosting retention and ingress controls need verification.');
 deny(path.isAbsolute(input.statePath||''),503,'DEPLOYMENT_INVALID','An explicit private canonical ledger path is required.');
 deny(path.isAbsolute(input.qlooHome||'')&&path.resolve(input.qlooHome)!==path.resolve(QLOO_HOME_DIR),503,'DEPLOYMENT_INVALID','Explicit public-only Qloo credential directory is required.');
 deny(validToken(input.expectedLedgerId)&&Number.isInteger(input.minimumLifetimeSpent)&&input.minimumLifetimeSpent>=0&&input.minimumLifetimeSpent<=500&&input.ledgerBaselineVerified===true,503,'LEDGER_BINDING_REQUIRED','Bind the existing ledger identity and verified spent floor.');
 return {...input,preview:false};
}
export function readDeployment(filename){
 const stat=lstatSync(filename);deny(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&stat.size<=16384,503,'DEPLOYMENT_INVALID','Use a private deployment file.');
 return validateDeployment(JSON.parse(readFileSync(filename,'utf8')));
}
export function verifyPublicLedger(configuration){
 const c=validateDeployment(configuration),stat=lstatSync(c.statePath);deny(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,503,'LEDGER_BINDING_REQUIRED','Use the canonical private ledger.');let db;
 try{db=new DatabaseSync(c.statePath,{readOnly:true});const p=JSON.parse(db.prepare('SELECT policy FROM config WHERE id=1').get().policy),spent=db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n;deny(p.betaSecurity?.ledgerId===c.expectedLedgerId&&spent>=c.minimumLifetimeSpent,503,'LEDGER_BINDING_REQUIRED','Ledger identity or spent floor differs.');}finally{db?.close();}
}
// Uses the existing config and creation_events tables. No schema migration.
export class BetaSecurity{
 constructor(state,configuration={preview:true},{validate=validateDeployment}={}){
  this.state=state;this.config=validate(configuration,{preview:configuration.preview===true});
  const policy=state.policy();
  if(!this.config.preview)deny(policy.betaSecurity?.ledgerId===this.config.expectedLedgerId&&state.usage('').total>=this.config.minimumLifetimeSpent,503,'LEDGER_BINDING_REQUIRED','The canonical ledger identity and spent floor are required.');
  if(!policy.betaSecurity){state.configure({betaSecurity:{version:1,ledgerId:token(),rateSecret:token(),invites:[]}});}
  deny(validToken(state.policy().betaSecurity?.rateSecret),503,'BETA_STATE_INVALID','Invalid beta security state.');
  deny(validToken(state.policy().betaSecurity.ledgerId),503,'BETA_STATE_INVALID','Invalid ledger identity.');state.configure({sessionHours:2});
 }
 validateInput(data){const check=value=>{if(typeof value!=='string')return;const text=value.replace(/\b(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}\b/g,'year range');deny(!/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d ()-]{7,}\d))/i.test(text),400,'PERSONAL_DATA_REJECTED','Do not enter contact details or links.');};check(data.name);check(data.text);check(data.title);for(const work of Array.isArray(data.works)?data.works:[])check(work?.title);for(const word of Array.isArray(data.elements)?data.elements:[])check(word);}
 sweep(){const s=this.state;s.transaction(()=>{const b=s.policy().betaSecurity,invites=b.invites.filter(x=>!x.used&&x.expires>s.now()),reviewInvites=(b.reviewInvites||[]).filter(x=>x.expires>s.now());if(invites.length!==b.invites.length||reviewInvites.length!==(b.reviewInvites||[]).length)this.writeBeta({...b,invites,reviewInvites});});}
 publicInfo(){const c=this.config;return {enabled:true,preview:c.preview,policyVersion:POLICY_VERSION,operatorName:c.operatorName,contact:c.contact,hostingProvider:c.hostingProvider,hostingRegion:c.hostingRegion,logRetentionDays:c.logRetentionDays,backupRetentionDays:c.backupRetentionDays};}
 origin(req){
  if(this.config.preview){deny(!req.headers.forwarded&&!Object.keys(req.headers).some(k=>k.startsWith('x-forwarded-')),403,'PROXY_DENIED','Preview mode does not accept forwarded traffic.');const host=req.headers.host;deny([`127.0.0.1:${req.socket.localPort}`,`localhost:${req.socket.localPort}`].includes(host),403,'HOST_DENIED','Invalid origin.');return 'http://'+host;}
  const url=new URL(this.config.publicOrigin);
  deny(loopback(req.socket.remoteAddress)&&req.headers.host===url.host&&req.headers['x-forwarded-proto']==='https'&&typeof req.headers['x-real-ip']==='string'&&isIP(req.headers['x-real-ip'])!==0&&!req.headers['x-forwarded-host'],403,'PROXY_DENIED','Untrusted proxy or origin.');
  return url.origin;
 }
 ip(req){let ip=this.config.preview?req.socket.remoteAddress:req.headers['x-real-ip'];deny(typeof ip==='string'&&isIP(ip)!==0,403,'PROXY_DENIED','Invalid client address.');if(ip.startsWith('::ffff:')&&isIP(ip.slice(7))===4)ip=ip.slice(7);if(isIP(ip)===6){const canonical=new SocketAddress({address:ip,family:'ipv6'}).address;const sides=canonical.split('::'),left=sides[0]?sides[0].split(':'):[],right=sides[1]?sides[1].split(':'):[],groups=sides.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;ip=groups.slice(0,4).map(x=>parseInt(x,16).toString(16)).join(':')+'::/64';}return createHmac('sha256',this.state.policy().betaSecurity.rateSecret).update(ip).digest('hex');}
 rate(req,scope,perIp,global=null,window=60000,identity=null){
  const now=this.state.now(),key='beta:'+scope+':'+(identity?hash(identity):this.ip(req)),authenticated=k=>['search','materials','join','access'].includes(k.split(':')[1]);
  // Rebuild rolling counters once; no full-table COUNT per request.
  if(!this.rateBuckets){this.rateBuckets=new Map();this.rateGlobals=new Map();for(const r of this.state.db.prepare("SELECT session,time FROM creation_events WHERE session LIKE 'beta:%' AND time>? ORDER BY time").all(now-600000)){const scope=r.session.split(':')[1];if(!this.rateBuckets.has(r.session))this.rateBuckets.set(r.session,[]);this.rateBuckets.get(r.session).push(r.time);if(!this.rateGlobals.has(scope))this.rateGlobals.set(scope,[]);this.rateGlobals.get(scope).push(r.time);}for(const kind of [false,true]){const keys=[...this.rateBuckets.keys()].filter(k=>authenticated(k)===kind);for(const k of keys.slice(0,-4096))this.rateBuckets.delete(k);}}
  if(!this.ratePruned||now-this.ratePruned>=60000){for(const [k,v] of this.rateBuckets){while(v.length&&v[0]<=now-600000)v.shift();if(!v.length)this.rateBuckets.delete(k);}this.ratePruned=now;}
  const total=this.rateGlobals.get(scope)||[];while(total.length&&total[0]<=now-window)total.shift();
  deny(!global||total.length<global,429,'BETA_RATE_LIMIT','Too many requests. Please wait.');
  const kind=!!identity;
  if(!this.rateBuckets.has(key)){
   const peers=[...this.rateBuckets.keys()].filter(k=>authenticated(k)===kind);
   if(peers.length>=4096)this.rateBuckets.delete(peers[0]);
   // Eviction bounds memory rather than rejecting every new source. Reload an
   // evicted source's durable window, so cycling addresses cannot reset it.
   const restored=this.state.db.prepare('SELECT time FROM creation_events WHERE session=? AND time>? ORDER BY time').all(key,now-window).map(x=>x.time);this.rateBuckets.set(key,restored);
  }
  const times=this.rateBuckets.get(key);while(times.length&&times[0]<=now-window)times.shift();
  deny(times.length<perIp,429,'BETA_RATE_LIMIT','Too many requests. Please wait.');
  this.rateBuckets.delete(key); // LRU within each trust class.
  this.state.db.prepare('INSERT INTO creation_events(session,time) VALUES (?,?)').run(key,now);times.push(now);this.rateBuckets.set(key,times);if(global)total.push(now);this.rateGlobals.set(scope,total);
 }
 ingress(req){
  deny(typeof req.url==='string'&&req.url.length<=2048&&!/[\x00-\x20\x7f]/.test(req.url)&&req.url.startsWith('/')&&!req.url.startsWith('//'),400,'PATH_INVALID','Invalid path.');
  this.rate(req,'requests',3000,20000);if(req.method==='POST')this.rate(req,'writes',300,4000);
 }
 reviewInvite(value,b=this.state.policy().betaSecurity){return validToken(value)?(b.reviewInvites||[]).find(x=>usableReviewInvite(x,this.state.now(),this.state.reviewInviteDeadline(x?.issuedAt))&&same(x.digest,hash(value))):null;}
 validateHostInvite(value){const b=this.state.policy().betaSecurity;deny(validToken(value)&&(b.invites.some(x=>!x.used&&same(x.digest,hash(value))&&x.expires>this.state.now())||this.reviewInvite(value,b)),403,'INVITE_INVALID','A valid host invitation is required.');}
 issueReviewInvite({expiresAt,maxRooms=8}={}){
  const s=this.state;deny(Number.isSafeInteger(expiresAt)&&expiresAt>s.now()&&expiresAt<=s.reviewInviteDeadline(s.now())&&Number.isInteger(maxRooms)&&maxRooms>=1&&maxRooms<=12,400,'INVITE_INVALID','Use a finite review expiry and at most 12 rooms.');
  const value=token();s.transaction(()=>{const b=s.policy().betaSecurity,reviewInvites=(b.reviewInvites||[]).filter(x=>x.expires>s.now());deny(reviewInvites.length<3,429,'INVITE_LIMIT','Too many review invitations.');reviewInvites.push({digest:hash(value),issuedAt:s.now(),expires:expiresAt,maxRooms,usedRooms:0});this.writeBeta({...b,reviewInvites});});return value;
 }
 extendReviewInvite({invitation,expiresAt}={}){const s=this.state;return s.transaction(()=>{
  const b=s.policy().betaSecurity,existing=this.reviewInvite(invitation,b);
  deny(existing&&Number.isSafeInteger(expiresAt)&&expiresAt>existing.expires&&expiresAt<=s.reviewInviteDeadline(existing.issuedAt),400,'INVITE_INVALID','Use an active review invitation and a bounded later expiry.');
  this.writeBeta({...b,reviewInvites:b.reviewInvites.map(v=>v===existing?{...v,expires:expiresAt}:v)});
  return {extended:true,expiresAt,maxRooms:existing.maxRooms,usedRooms:existing.usedRooms};
 });}
 revokeReviewInvites(){const s=this.state;s.transaction(()=>{const b=s.policy().betaSecurity;this.writeBeta({...b,reviewInvites:[]});});}

 issueInvite({expiresInMs=3600000}={}){
  deny(Number.isInteger(expiresInMs)&&expiresInMs>0&&expiresInMs<=86400000,400,'INVITE_INVALID','Invalid invitation expiry.');
  const value=token(),s=this.state;s.transaction(()=>{const p=s.policy(),b=p.betaSecurity,invites=b.invites.filter(x=>x.expires>s.now()&&!x.used);deny(invites.length<100,429,'INVITE_LIMIT','Too many invitations.');invites.push({digest:hash(value),expires:s.now()+expiresInMs,used:false});this.writeBeta({...b,invites});});return value;
 }
 writeBeta(beta){const p=this.state.policy();this.state.db.prepare('UPDATE config SET policy=? WHERE id=1').run(JSON.stringify({...p,betaSecurity:beta}));}
 createRoom(session,data,create){
  this.validateInput(data);deny(data.flow==='cards'&&!data.sample,400,'BETA_FLOW_REQUIRED','Only the current workshop is available.');
  deny(data.policyVersion===POLICY_VERSION,400,'POLICY_REQUIRED','Review the current terms and privacy notice.');
  deny(validToken(data.hostInvite),403,'INVITE_INVALID','A valid host invitation is required.');
  const s=this.state;return s.transaction(()=>{const b=s.policy().betaSecurity,invite=b.invites.find(x=>same(x.digest,hash(data.hostInvite))&&!x.used&&x.expires>s.now()),review=this.reviewInvite(data.hostInvite,b);deny(invite||review,403,'INVITE_INVALID','A valid host invitation is required.');const r=create();r.beta={key:token(),generation:1,admissions:[],locked:false,policyVersion:POLICY_VERSION};s.saveRoom(r);if(invite)this.writeBeta({...b,invites:b.invites.filter(x=>x!==invite)});else this.writeBeta({...b,reviewInvites:b.reviewInvites.map(x=>x===review?{...x,usedRooms:x.usedRooms+1}:x)});return r;});
 }
 roomAccess(r,session){return !!session?.digest&&r?.flow==='cards'&&!!r.beta&&(hasHostAccess(r,session)||r.members.some(m=>m.browser===session.digest)||(r.beta.admissions||[]).includes(session.digest));}
 requireAccess(r,session){deny(this.roomAccess(r,session),403,'ROOM_ACCESS_REQUIRED','Open the full participant invitation from the host.');}
 validateParticipantInvite(r,value){deny(validToken(value)&&r.beta&&!r.beta.locked&&same(hash(r.beta.key),hash(value)),403,'ROOM_ACCESS_REQUIRED','A valid participant invitation is required.');}
 admit(id,session,value){
  deny(validToken(value),403,'ROOM_ACCESS_REQUIRED','A valid participant invitation is required.');
  this.state.mutateRoom(id,r=>{deny(r.beta&&!r.beta.locked&&same(hash(r.beta.key),hash(value)),403,'ROOM_ACCESS_REQUIRED','A valid participant invitation is required.');r.beta.admissions=[...new Set([...(r.beta.admissions||[]),session.digest])];deny(r.beta.admissions.length<=24,429,'ADMISSION_LIMIT','The invitation has reached its browser limit.');r.revision++;});
 }
 decorate(r,session,view,data){
  data.beta={...this.publicInfo(),locked:r.beta.locked,hasOwnData:r.members.some(m=>m.browser===session?.digest)};if(view==='host'&&hasHostAccess(r,session)){data.beta.participantKey=r.beta.key;data.beta.generation=r.beta.generation;}return data;
 }
 rotate(id,session,locked){return this.state.mutateRoom(id,r=>{deny(hasHostAccess(r,session),403,'HOST_REQUIRED','Host access is required.');r.beta.key=token();r.beta.generation++;r.beta.admissions=[];r.beta.locked=locked;r.revision++;});}
 scrubAttempts(id){this.state.discardAttempts(id);}
 eraseMember(id,session,memberId=null){
  const s=this.state;s.transaction(()=>{const r=s.loadRoom(id);this.requireAccess(r,session);if(memberId)deny(hasHostAccess(r,session),403,'HOST_REQUIRED','Host access is required.');const m=r.members.find(m=>memberId?m.id===memberId:m.browser===session.digest);deny(m,403,'MEMBER_REQUIRED','This browser has no participant data.');
   r.members=r.members.filter(x=>x.id!==m.id);delete r.lookups[m.id];r.visited=r.visited.filter(x=>x!==m.id);if(r.turn?.speaker===m.id)r.turn=null;r.history=r.history.filter(t=>t.speaker!==m.id);for(const t of [r.turn,...r.history].filter(Boolean)){t.questions=t.questions.filter(q=>q.author!==m.id);t.confirmations=t.confirmations.filter(c=>t.questions.some(q=>q.id===c.question));}r.beta.key=token();r.beta.generation++;r.beta.admissions=[];r.revision++;s.saveRoom(r);this.scrubAttempts(id);
  });
 }
 eraseRoom(id,session){const s=this.state;s.transaction(()=>{const r=s.loadRoom(id);deny(hasHostAccess(r,session),403,'HOST_REQUIRED','Host access is required.');s.db.prepare('DELETE FROM rooms WHERE id=?').run(id);s.db.prepare('DELETE FROM grants WHERE room=?').run(id);this.scrubAttempts(id);});}
 forget(session){
  for(const r of this.state.loadRooms().filter(r=>r.beta)){if(hasHostAccess(r,session))this.eraseRoom(r.id,session);else if(r.members.some(m=>m.browser===session.digest))this.eraseMember(r.id,session);else if(r.beta.admissions.includes(session.digest))this.state.mutateRoom(r.id,v=>{v.beta.admissions=v.beta.admissions.filter(x=>x!==session.digest);});}this.state.forget(session);
 }
 allowQloo(r){
  const s=this.state,p=s.policy(),a=p.publicBetaAuthorization;
  deny(!this.config.preview&&s.livePermitted(p)&&a?.origin===this.config.publicOrigin&&r.beta&&!r.sample&&r.flow==='cards',423,'LIVE_DISABLED','Public Qloo access is disabled.');
  s.grant(r.id,snapshotHash(r),{cap:Math.min(30,p.room),expires:Math.min(r.created+7200000,a.expiresAt)});
 }
}
export function authorizePublicQloo(state,configuration,{ceiling,daily,room,expiresAt,confirmation}={}){
 const c=validateDeployment(configuration),p=state.policy(),used=state.usage('').total;
 deny(p.betaSecurity?.ledgerId===c.expectedLedgerId&&used>=c.minimumLifetimeSpent,503,'LEDGER_BINDING_REQUIRED','The canonical ledger is required.');
 deny(confirmation==='PUBLIC_QLOO_BUDGET_CONFIRMED'&&c.qlooPublicUseConfirmed===true&&c.qlooTermsReviewed===true&&c.providerBudgetVerified===true,423,'PUBLIC_BUDGET_REQUIRED','Confirm provider terms, provider-side cap and a separate public budget.');
 deny(Number.isSafeInteger(ceiling)&&ceiling>used&&ceiling<=500&&Number.isInteger(daily)&&daily>=1&&daily<=200&&Number.isInteger(room)&&room>=1&&room<=30&&Number.isSafeInteger(expiresAt)&&expiresAt>state.now()&&expiresAt<=state.now()+7200000,400,'PUBLIC_BUDGET_REQUIRED','A finite public budget and expiry are required.');
 deny(state.filename===':memory:'||!p.localTestAuthorization||!!p.liveLedgerBinding&&state.bindingMatches()||state.filename===STATE_PATH,503,'LEDGER_BINDING_REQUIRED','Bind the legacy ledger at its canonical path before migration.');state.bindLiveLedger();return state.configure({enabled:true,confirmedFree:false,total:ceiling,daily,room,localTestAuthorization:null,publicBetaAuthorization:{endpoint:OFFICIAL_ORIGIN,origin:c.publicOrigin,absoluteCeiling:ceiling,expiresAt,ledgerId:c.expectedLedgerId,policyVersion:POLICY_VERSION}});
}
