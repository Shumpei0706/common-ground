import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {SecurityState,hash,snapshotHash,knownExecution} from '../scripts/security-state.mjs';
import {BetaSecurity} from '../scripts/beta-security.mjs';
import {authorizeLocalTest} from '../scripts/local-test-admin.mjs';
import {retireAndExport} from '../scripts/cloudflare-budget-migrate.mjs';
import {CloudState} from '../cloudflare/budget.mjs';
import {createNativeTransport} from '../cloudflare/qloo-fetch.mjs';
import {QlooGuard} from '../scripts/qloo-guard.mjs';
import {cloudRuntime} from '../cloudflare/runtime.mjs';
const now=Date.parse('2026-10-22T03:00:00Z'),origin='https://workshop.test',id='b'.repeat(64),apiKey='fictional-private-key';
function fixture({versionId=null,at=now}={}){
 const source=new SecurityState(':memory:',{now:()=>at});new BetaSecurity(source,{preview:true});
 for(let n=1;n<=214;n++)source.db.prepare('INSERT INTO attempts(id,job,room,day,start,state,result) VALUES (?,?,?,?,?,?,?)').run(n,hash('historical-'+n),'OLD123','2026-10-15',Date.parse('2026-10-15T00:00:00Z')+n*1000,'success',JSON.stringify({participantName:'DO_NOT_EXPORT',entities:[{title:'PRIVATE_HISTORY'}]}));
 const manifest=retireAndExport(source,{targetOrigin:origin,targetObjectId:id}),baselineHash=hash(JSON.stringify(manifest)),db=new DatabaseSync(':memory:');let clock=at;
 const options={id,origin,baselineHash,versionId,now:()=>clock};let state=new CloudState(db,options);new BetaSecurity(state,{preview:true});
 return {source,manifest,db,get state(){return state;},baselineHash,import(){return state.importBudget(manifest);},arm(extra={}){return state.arm({confirmation:'ARM_CLOUD_QLOO_CUMULATIVE_1000',bootNonce:state.bootNonce,manifestHash:baselineHash,observedSpent:state.usage('').total,observedDaily:state.usage('').daily,ceiling:1000,daily:200,room:30,expiresAt:clock+7200000,...extra});},room(code='ABCDEF'){const r={id:code,created:clock,snapshot:[]};state.saveRoom(r);state.grant(code,snapshotHash(r),{cap:30,expires:clock+7200000});return {room:code,snapshot:snapshotHash(r)};},tick(ms){clock+=ms;},restart(nextVersion=options.versionId){options.versionId=nextVersion;state=new CloudState(db,options);},close(){source.close();db.close();}};
}
const empty=()=>new Response(JSON.stringify({results:[]}),{status:200});
const query={operation:'search',kind:'movie',text:'Fictional film',take:5};

test('canonical retirement/export preserves spent slots and strips content; local rearm is prohibited',()=>{const f=fixture();try{assert.equal(f.manifest.sourceSpent,214);assert.equal(f.manifest.attempts.length,214);assert(!JSON.stringify(f.manifest).includes('PRIVATE_HISTORY'));assert(!JSON.stringify(f.manifest).includes('DO_NOT_EXPORT'));assert.equal(f.source.usage('').total,214);assert.equal(f.source.livePermitted(),false);assert.throws(()=>authorizeLocalTest(f.source,500),{code:'LEDGER_RETIRED'});assert.throws(()=>f.source.reserveSmoke(hash('new')),{code:'LEDGER_RETIRED'});assert.throws(()=>retireAndExport(f.source,{targetOrigin:origin,targetObjectId:'c'.repeat(64)}),{code:'MIGRATION_BOUND'});}finally{f.close();}});

test('cloud import is exact-hash and object bound, import-once and retains conservative floor before import',()=>{const f=fixture();try{assert.equal(f.state.livePermitted(),false);assert.equal(f.state.usage('').total,214);assert.throws(()=>f.state.importBudget({...f.manifest,sourceSpent:0}),{code:'IMPORT_HASH_REQUIRED'});assert.equal(f.import().used.total,214);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n,214);assert.throws(()=>f.import(),{code:'IMPORT_ALREADY_BOUND'});assert.equal(f.arm().enabled,true);f.tick(7200001);assert.equal(f.state.livePermitted(),false);}finally{f.close();}});

test('cloud restart stops API and requires fresh activation challenge and externally recorded floor',()=>{const f=fixture();try{f.import();f.arm();const stale=f.state.bootNonce;f.restart();assert.equal(f.state.livePermitted(),false);assert.notEqual(f.state.bootNonce,stale);assert.throws(()=>f.arm({bootNonce:stale}),{code:'ARM_REVIEW_REQUIRED'});assert.throws(()=>f.arm({observedSpent:215}),{code:'EXTERNAL_FLOOR_MISMATCH'});assert.throws(()=>f.arm({ceiling:1001}),{code:'BUDGET_INVALID'});assert.equal(f.arm().enabled,true);}finally{f.close();}});

test('native search performs one fixed-origin request and cumulative ceiling includes all historical calls',async()=>{const f=fixture();try{f.import();f.arm({ceiling:215});const r=f.room();let calls=0;const native=createNativeTransport({apiKey,fetchImpl:async(url,options)=>{calls++;assert.equal(new URL(url).origin,'https://hackathon.api.qloo.com');assert.equal(options.redirect,'manual');assert.equal(options.headers['X-Api-Key'],apiKey);return empty();}}),guard=new QlooGuard(f.state,{transport:native.search,verifiedSingleAttempt:true});await guard.execute(r.room,r.snapshot,query);assert.equal(calls,1);assert.equal(f.state.usage('').total,215);f.tick(1001);const other=f.room('FEDCBA');await assert.rejects(guard.execute(other.room,other.snapshot,{...query,text:'Other work'}),{code:'BUDGET_EXHAUSTED'});assert.equal(calls,1);}finally{f.close();}});

test('native failed request blocks cross-room and changed-take query families without fabricating child proof',async()=>{const f=fixture();try{f.import();f.arm();let calls=0;const native=createNativeTransport({apiKey,fetchImpl:async()=>{calls++;return new Response('',{status:503});}}),guard=new QlooGuard(f.state,{transport:native.search,verifiedSingleAttempt:true}),r=f.room();await assert.rejects(guard.execute(r.room,r.snapshot,query),{code:'UPSTREAM_FAILURE'});const row=f.db.prepare('SELECT state,result FROM attempts ORDER BY id DESC LIMIT 1').get(),d=JSON.parse(row.result).diagnostic;assert.equal(row.state,'failed');assert.equal(d.childClosed,false);assert.equal(d.transportKind,'fetch');assert.equal(knownExecution(d),true);assert.equal(f.state.livePermitted(),false);f.tick(1001);f.arm();const other=f.room('FEDCBA');await assert.rejects(guard.execute(other.room,other.snapshot,{...query,take:1}),{code:'QUERY_ABANDONED'});assert.equal(calls,1);}finally{f.close();}});

test('unknown network outcome spends one slot, stops API and blocks rearming across restart',async()=>{const f=fixture();try{f.import();f.arm();let calls=0;const native=createNativeTransport({apiKey,fetchImpl:async()=>{calls++;throw Error('private network detail');}}),guard=new QlooGuard(f.state,{transport:native.search,verifiedSingleAttempt:true}),r=f.room();await assert.rejects(guard.execute(r.room,r.snapshot,query),e=>e.code==='QLOO_FETCH_FAILED'&&!e.message.includes('private network'));assert.equal(calls,1);assert.equal(f.state.usage('').total,215);assert.equal(f.state.operatorStatus().unsettled,1);f.restart();assert.equal(f.state.livePermitted(),false);assert.throws(()=>f.arm(),{code:'ARM_REVIEW_REQUIRED'});}finally{f.close();}});

test('concurrent requests reserve at most one physical Qloo call and erasure drains without resurrection',async()=>{const f=fixture();try{f.import();f.arm();let release,started;const begun=new Promise(r=>started=r),response=new Promise(r=>release=r),native=createNativeTransport({apiKey,fetchImpl:async()=>{started();return response;}}),guard=new QlooGuard(f.state,{transport:native.search,verifiedSingleAttempt:true}),r=f.room(),other=f.room('FEDCBA'),task=guard.execute(r.room,r.snapshot,query);await begun;await assert.rejects(guard.execute(other.room,other.snapshot,{...query,text:'Other film'}),{code:'IN_FLIGHT'});f.state.db.prepare('DELETE FROM rooms WHERE id=?').run(r.room);f.state.discardAttempts(r.room);release(empty());await assert.rejects(task,{code:'RESULT_REMOVED'});const row=f.db.prepare('SELECT state,result FROM attempts ORDER BY id DESC LIMIT 1').get();assert.equal(row.state,'success');assert.equal(JSON.parse(row.result).discarded,true);assert(!JSON.stringify(row).includes('entities'));assert.equal(f.state.usage('').total,215);}finally{f.close();}});

test('native response redirect, size and abort boundaries do not retry or expose credentials',async()=>{let calls=0;const redirect=createNativeTransport({apiKey,fetchImpl:async()=>{calls++;return new Response('',{status:302,headers:{Location:'https://attacker.test'}});}});assert.equal((await redirect.search(query)).status,302);assert.equal(calls,1);const huge=createNativeTransport({apiKey,fetchImpl:async()=>new Response('x',{headers:{'content-length':'1048577'}})});await assert.rejects(huge.search(query),e=>e.code==='RESPONSE_LIMIT'&&e.diagnostic.physicalAttempts===1&&!e.message.includes(apiKey));const stalled=createNativeTransport({apiKey,timeoutMs:5,fetchImpl:async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('secret')),{once:true}))});await assert.rejects(stalled.search(query),{code:'QLOO_FETCH_FAILED'});});

test('expired historical content is scrubbed once; repeated sweeps do not rewrite every attempt',()=>{const f=fixture();try{f.import();f.state.sweep();const before=f.db.prepare('SELECT total_changes() AS n').get().n;f.state.sweep();const after=f.db.prepare('SELECT total_changes() AS n').get().n;assert.equal(after,before);assert.equal(f.state.usage('').total,214);}finally{f.close();}});

test('nested synchronous ledger operations remain atomic on rollback',()=>{const s=new SecurityState(':memory:');try{const old=s.policy();assert.throws(()=>s.transaction(()=>{s.configure({total:10});throw Error('rollback');}));assert.deepEqual(s.policy(),old);}finally{s.close();}});


test('native search accepts the actual Qloo results array and projects large unrelated metadata before guard validation',async()=>{
 const uuid='10000000-0000-0000-0000-000000000001';let calls=0;
 const transport=createNativeTransport({apiKey,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({results:[{entity_id:uuid,name:'Fictional film',types:['urn:entity:movie'],properties:{release_year:2001,unused:'x'.repeat(350000)},disambiguation:'Public director'}]}));}});
 const result=await transport.search(query),entity=JSON.parse(result.body).results.entities[0];assert.equal(calls,1);assert.equal(entity.entity_id,uuid);assert.equal(entity.subtype,'urn:entity:movie');assert.match(entity.disambiguation,/2001/);assert(!result.body.includes('unused'));assert(result.body.length<1000);
});

test('native raw search rejects excessive results and invalid IDs without accepting a CLI-only envelope',async()=>{
 for(const data of [{success:false,results:[]},{success:'true',results:[]},{success:true,results:{entities:[]}},{success:true,results:Array(6).fill({})},{success:true,results:[{entity_id:'invalid',name:'Invalid'}]}]){
  let calls=0;const transport=createNativeTransport({apiKey,fetchImpl:async()=>{calls++;return new Response(JSON.stringify(data));}});
  await assert.rejects(transport.search(query),{code:'RESPONSE_INVALID'});assert.equal(calls,1);
 }
});


test('quota observation retains only numeric quota headers without extra requests or mutable references',async()=>{
 let calls=0;const transport=createNativeTransport({apiKey,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({results:[]}),{headers:{'x-month-ratelimit-limit':'10000','x-month-ratelimit-remaining':'9767','x-second-ratelimit-limit':'5','ratelimit-reset':'60','x-ratelimit-remaining':'private-value','retry-after':'1','set-cookie':'secret-cookie','authorization':'secret-token','x-api-key':apiKey,'x-month-ratelimit-reset':'9'.repeat(17)}});}});
 assert.equal(transport.quotaObservation(),null);await transport.search(query);assert.equal(calls,1);
 const observed=transport.quotaObservation();assert.equal(observed.httpStatus,200);assert.match(observed.requestHash,/^[a-f0-9]{64}$/);assert.deepEqual(observed.headers,{'x-second-ratelimit-limit':'5','x-month-ratelimit-limit':'10000','x-month-ratelimit-remaining':'9767','ratelimit-reset':'60','retry-after':'1'});
 assert(!JSON.stringify(observed).includes('secret'));assert(!JSON.stringify(observed).includes(apiKey));observed.headers['x-month-ratelimit-limit']='1';assert.equal(transport.quotaObservation().headers['x-month-ratelimit-limit'],'10000');assert.equal(calls,1);
});

test('rate-limit responses remain single attempts and their numeric headers are observable',async()=>{
 let calls=0;const transport=createNativeTransport({apiKey,fetchImpl:async()=>{calls++;return new Response('',{status:429,headers:{'x-month-ratelimit-remaining':'0','retry-after':'60'}});}});
 const response=await transport.search(query);assert.equal(response.status,429);assert.equal(calls,1);assert.equal(transport.quotaObservation().headers['x-month-ratelimit-remaining'],'0');
});


test('cloud quota metadata is restricted to authenticated operator status',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const app=cloudRuntime(db,{id,origin,operatorName:'Fixture operator',contact:'fixture@workshop.test',baselineHash:'a'.repeat(64),apiKey,now:()=>now}),adminToken='a'.repeat(64);
  const request=authorization=>new Request(origin+'/api/operator/status',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:'{}'});
  await assert.rejects(app.handle(request(),{ip:'198.51.100.5',adminToken}),{code:'HOST_REQUIRED'});
  const status=await app.handle(request('Bearer '+adminToken),{ip:'198.51.100.5',adminToken}),value=await status.json();assert.equal(status.status,200);assert.equal(value.qlooResponse,null);
  const publicResponse=await app.handle(new Request(origin+'/api/app-config'),{ip:'198.51.100.5',adminToken});assert.equal(publicResponse.status,200);assert.equal(Object.hasOwn(await publicResponse.json(),'qlooResponse'),false);
 }finally{db.close();}
});


test('display counter cache cannot authorize spending past the exact cumulative limit',()=>{
 const f=fixture();try{f.import();f.arm({ceiling:215});const r=f.room();assert.equal(f.state.status(r.room,r.snapshot).used.total,214);const reserved=f.state.reserve(r.room,r.snapshot,hash('display-reservation'),hash('display-query'));f.state.finish(reserved.id,'success',{entities:[]});assert.equal(f.state.status(r.room,r.snapshot).used.total,215);
  f.state.displayCounts.get(r.room).value.total=0;assert.equal(f.state.status(r.room,r.snapshot).used.total,0);assert.equal(f.state.operatorStatus().used.total,215);f.tick(1001);assert.throws(()=>f.state.reserve(r.room,r.snapshot,hash('other-reservation'),hash('other-query')),{code:'BUDGET_EXHAUSTED'});assert.equal(f.state.usage('').total,215);
 }finally{f.close();}
});

test('display counts refresh on timeout, UTC day change and runtime restart',()=>{
 const f=fixture();try{f.import();const r=f.room();const a=f.state.displayUsage(r.room);f.state.displayCounts.get(r.room).value.total=0;f.tick(60000);assert.equal(f.state.displayUsage(r.room).total,a.total);f.tick(86400000);assert.equal(f.state.displayUsage(r.room).daily,0);f.restart();assert.equal(f.state.displayCounts,undefined);assert.equal(f.state.displayUsage(r.room).total,214);}finally{f.close();}
});

const reviewVersion='11111111-1111-4111-8111-111111111111',nextReviewVersion='22222222-2222-4222-8222-222222222222';
const reviewArm=(f,extra={})=>f.arm({mode:'invited-review',confirmation:'ARM_CLOUD_QLOO_CUMULATIVE_2000',versionId:reviewVersion,ceiling:2000,expiresAt:now+7*86400000,...extra});

test('invited review survives same-version eviction and exceeds two hours only within approved bounds',()=>{
 const f=fixture({versionId:reviewVersion});try{f.import();assert.equal(reviewArm(f).enabled,true);const nonce=f.state.bootNonce;f.tick(7200001);f.restart();assert.notEqual(f.state.bootNonce,nonce);assert.equal(f.state.livePermitted(),true);assert.equal(f.state.operatorStatus().activationMode,'invited-review');assert.equal(f.state.operatorStatus().versionId,reviewVersion);assert.equal(f.state.usage('').total,214);}finally{f.close();}
});

test('session mode remains boot-bound even when a valid Worker version is configured',()=>{
 const f=fixture({versionId:reviewVersion});try{f.import();assert.equal(f.arm().enabled,true);f.restart();assert.equal(f.state.livePermitted(),false);assert.equal(f.state.policy().publicBetaAuthorization,null);assert.equal(f.state.usage('').total,214);}finally{f.close();}
});

test('invited review requires the server version and rejects unapproved ceilings, modes and deadlines',()=>{
 const f=fixture({versionId:reviewVersion});try{f.import();for(const bad of [{versionId:null},{versionId:nextReviewVersion},{ceiling:2001},{expiresAt:Date.parse('2026-11-17T06:00:00Z')+1},{mode:'always-on',confirmation:'ARM_CLOUD_QLOO_CUMULATIVE_1000'}])assert.throws(()=>reviewArm(f,bad),{code:'BUDGET_INVALID'});assert.throws(()=>f.arm({expiresAt:now+7200001}),{code:'BUDGET_INVALID'});reviewArm(f,{expiresAt:now+1000});f.tick(1001);assert.equal(f.state.livePermitted(),false);f.restart();assert.equal(f.state.policy().enabled,false);}finally{f.close();}
 const missing=fixture();try{missing.import();assert.throws(()=>reviewArm(missing),{code:'BUDGET_INVALID'});}finally{missing.close();}
});

test('new or missing server version stops review and a subsequent rollback cannot resurrect the grant',()=>{
 for(const changed of [nextReviewVersion,null]){const f=fixture({versionId:reviewVersion});try{f.import();reviewArm(f);f.restart(changed);assert.equal(f.state.livePermitted(),false);assert.equal(f.state.policy().publicBetaAuthorization,null);f.restart(reviewVersion);assert.equal(f.state.livePermitted(),false);assert.equal(f.state.usage('').total,214);}finally{f.close();}}
});

test('explicit stop and known transport failure remain stopped after same-version restart',async()=>{
 const f=fixture({versionId:reviewVersion});try{f.import();reviewArm(f);f.state.stop();f.restart();assert.equal(f.state.livePermitted(),false);reviewArm(f);let calls=0;const native=createNativeTransport({apiKey,fetchImpl:async()=>{calls++;return new Response('',{status:503});}}),guard=new QlooGuard(f.state,{transport:native.search,verifiedSingleAttempt:true}),r=f.room();await assert.rejects(guard.execute(r.room,r.snapshot,query),{code:'UPSTREAM_FAILURE'});f.restart();assert.equal(f.state.livePermitted(),false);assert.equal(f.state.usage('').total,215);assert.equal(calls,1);}finally{f.close();}
});

test('crash with a reserved but unresolved send disables persistent review at startup without refund',()=>{
 const f=fixture({versionId:reviewVersion});try{f.import();reviewArm(f);const r=f.room();f.state.reserve(r.room,r.snapshot,hash('review-crash'),hash(JSON.stringify(query)));assert.equal(f.state.usage('').total,215);f.restart();assert.equal(f.state.livePermitted(),false);assert.equal(f.state.operatorStatus().unsettled,1);assert.equal(f.state.usage('').total,215);assert.throws(()=>reviewArm(f),{code:'ARM_REVIEW_REQUIRED'});}finally{f.close();}
});

test('persistent review keeps exact cumulative accounting, cached jobs and hard stop across restart',async()=>{
 const f=fixture({versionId:reviewVersion});try{f.import();reviewArm(f,{ceiling:215});let calls=0;const native=createNativeTransport({apiKey,fetchImpl:async()=>{calls++;return empty();}}),make=()=>new QlooGuard(f.state,{transport:native.search,verifiedSingleAttempt:true}),r=f.room();await make().execute(r.room,r.snapshot,query);f.tick(1001);f.restart();await make().execute(r.room,r.snapshot,query);assert.equal(calls,1);const other=f.room('FEDCBA');await assert.rejects(make().execute(other.room,other.snapshot,{...query,text:'Another fictional work'}),{code:'BUDGET_EXHAUSTED'});assert.equal(calls,1);assert.equal(f.state.usage('').total,215);}finally{f.close();}
});

test('persistent review does not replenish per-day or per-room slots at restart',async()=>{
 for(const limit of ['daily','room']){const f=fixture({versionId:reviewVersion});try{f.import();reviewArm(f,{[limit]:1});let calls=0;const native=createNativeTransport({apiKey,fetchImpl:async()=>{calls++;return empty();}}),make=()=>new QlooGuard(f.state,{transport:native.search,verifiedSingleAttempt:true}),r=f.room();await make().execute(r.room,r.snapshot,query);f.tick(1001);f.restart();const second=limit==='room'?r:f.room('FEDCBA');await assert.rejects(make().execute(second.room,second.snapshot,{...query,text:'Second fictional work'}),{code:'BUDGET_EXHAUSTED'});assert.equal(calls,1);assert.equal(f.state.usage('').total,215);}finally{f.close();}}
});


test('a committed failure without a stop write cannot resume review after restart',()=>{
 const f=fixture({versionId:reviewVersion});try{f.import();reviewArm(f);const r=f.room();const attempt=f.state.reserve(r.room,r.snapshot,hash('split-failure-write'),hash(JSON.stringify(query)));f.state.finish(attempt.id,'failed',{errorCode:'SYNTHETIC_FAILURE'});assert.equal(f.state.policy().enabled,true);f.restart();assert.equal(f.state.livePermitted(),false);assert.equal(f.state.usage('').total,215);f.tick(1001);reviewArm(f);f.restart();assert.equal(f.state.livePermitted(),true);assert.equal(f.state.usage('').total,215);}finally{f.close();}
});


test('cloud-only 2000 ceiling reserves the last historical-inclusive slot once across restart and day changes',async()=>{
 const f=fixture({versionId:reviewVersion});try{f.import();
  f.state.transaction(()=>{for(let n=215;n<=1999;n++)f.db.prepare('INSERT INTO attempts(id,job,room,day,start,state,result) VALUES (?,?,?,?,?,?,?)').run(n,hash('synthetic-spent-'+n),'OLD123','2026-10-15',Date.parse('2026-10-15T00:00:00Z')+n,'success','{}');});
  assert.throws(()=>reviewArm(f,{confirmation:'ARM_CLOUD_QLOO_CUMULATIVE_1000'}),{code:'ARM_REVIEW_REQUIRED'});assert.equal(reviewArm(f,{expiresAt:Date.parse('2026-11-17T06:00:00Z')}).enabled,true);
  let calls=0;const transport=createNativeTransport({apiKey,fetchImpl:async()=>{calls++;return empty();}}),r=f.room(),other=f.room('FEDCBA'),guard=new QlooGuard(f.state,{transport:transport.search,verifiedSingleAttempt:true});
  const results=await Promise.allSettled([guard.execute(r.room,r.snapshot,query),guard.execute(other.room,other.snapshot,{...query,text:'Other fictional work'})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,1);assert.equal(f.state.usage('').total,2000);
  f.tick(86400001);f.restart();const next=f.room('CDEFAB');await assert.rejects(new QlooGuard(f.state,{transport:transport.search,verifiedSingleAttempt:true}).execute(next.room,next.snapshot,{...query,text:'After new day'}),{code:'BUDGET_EXHAUSTED'});assert.equal(calls,1);assert.equal(f.state.usage('').total,2000);assert.throws(()=>f.state.configure({total:2001}),{code:'LEDGER_POLICY'});
 }finally{f.close();}
 const local=new SecurityState(':memory:');try{assert.throws(()=>local.configure({total:1001}),{code:'LEDGER_POLICY'});}finally{local.close();}
});

test('invited review spans the judging period but stops at the exact November17 boundary',()=>{
 const f=fixture({versionId:reviewVersion});try{f.import();const end=Date.parse('2026-11-17T06:00:00Z');assert.equal(reviewArm(f,{expiresAt:end}).enabled,true);f.tick(25*86400000);f.restart();assert.equal(f.state.livePermitted(),true);f.tick(end-now-25*86400000);assert.equal(f.state.livePermitted(),false);f.restart();assert.equal(f.state.policy().enabled,false);assert.throws(()=>f.arm({ceiling:1001}),{code:'BUDGET_INVALID'});}finally{f.close();}
});


test('cloud 30-day bound is enforced independently of the later fixed judging deadline',()=>{
 const at=Date.parse('2026-10-16T03:00:00Z'),end=at+30*86400000,f=fixture({versionId:reviewVersion,at});try{f.import();assert(end<Date.parse('2026-11-17T06:00:00Z'));assert.throws(()=>reviewArm(f,{expiresAt:end+1}),{code:'BUDGET_INVALID'});assert.equal(reviewArm(f,{expiresAt:end}).enabled,true);const beta=new BetaSecurity(f.state,{preview:true});assert.throws(()=>beta.issueReviewInvite({expiresAt:end+1}),{code:'INVITE_INVALID'});const invitation=beta.issueReviewInvite({expiresAt:at+86400000,maxRooms:8});f.tick(1001);assert.throws(()=>beta.extendReviewInvite({invitation,expiresAt:end+1}),{code:'INVITE_INVALID'});assert.equal(beta.extendReviewInvite({invitation,expiresAt:end}).expiresAt,end);assert.equal(f.state.policy().betaSecurity.reviewInvites[0].issuedAt,at);}finally{f.close();}
});
