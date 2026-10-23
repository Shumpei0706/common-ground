import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import {SecurityState,snapshotHash} from '../scripts/security-state.mjs';
import {BetaSecurity,validateDeployment,POLICY_VERSION,authorizePublicQloo} from '../scripts/beta-security.mjs';
import {createApp} from '../scripts/serve.mjs';
import {QlooGuard} from '../scripts/qloo-guard.mjs';
import {config,ep,deferred,fixture} from './helpers/public-beta-fixture.mjs';
test('public preflight requires real operator, HTTPS, explicit isolated state/key paths and verified release settings',()=>{
 for(const override of [{publicOrigin:'http://workshop.test'},{publicOrigin:'https://workshop.test/path'},{operatorName:'REPLACE_WITH_OPERATOR'},{contact:'bad'},{hostingControlsVerified:false},{edgeControlsVerified:false},{reviewedPolicyVersion:'old'},{logRetentionDays:31},{statePath:'relative'},{qlooHome:'relative'}])assert.throws(()=>validateDeployment({...config(),...override}),e=>e.code==='DEPLOYMENT_INVALID'||e.code==='RELEASE_REVIEW_REQUIRED');assert.equal(validateDeployment(config()).publicOrigin,config().publicOrigin);
});
test('public HTTP pins proxy and origin, uses Secure host-only cookies, bounds headers and disables old surfaces',async()=>{
 const f=await fixture();try{
  const r=await f.request('/api/session',{data:{}});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie');for(const part of ['__Host-cg_session=','Secure','HttpOnly','SameSite=Strict','Max-Age=7200','Path=/'])assert(cookie.includes(part));assert(!cookie.includes('Domain='));assert.equal(r.headers.get('strict-transport-security'),'max-age=31536000');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  for(const headers of [{Host:'evil.test'},{'X-Forwarded-Proto':'http'},{'X-Real-IP':'1.2.3.4, 5.6.7.8'},{'X-Forwarded-Host':'workshop.test'}])assert.equal((await f.request('/api/app-config',{headers})).status,403);
  const jar=await f.ticket();assert.equal((await f.request('/api/session/forget',{jar,data:{},headers:{Origin:'https://evil.test'}})).status,403);assert.equal((await f.request('/api/session/forget',{jar,data:{},headers:{'X-CG-CSRF':'wrong'}})).status,403);
  for(const route of ['/api/catalog','/api/gather/config','/api/rooms','/api/rooms/ABC123/export','/app.js','/insights-records.js','/intro/en.mp4','/.env','/../scripts/serve.mjs'])assert.equal((await f.request(route,{jar})).status,404,route);
 }finally{await f.close();}
});
test('single-use host invitation is atomic, required on every creation, and cannot select a legacy flow',async()=>{
 const f=await fixture();try{const h=await f.ticket(),q=await f.ticket(),invitation=f.beta.issueInvite();const input={flow:'cards',hostPassword:'fixture-only-passphrase',policyVersion:POLICY_VERSION,hostInvite:invitation,size:3};const results=await Promise.all([f.request('/api/gather',{jar:h,data:input}),f.request('/api/gather',{jar:q,data:input})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,403]);assert.equal(f.state.loadRooms().length,1);f.tick(600001);assert.equal((await f.request('/api/gather',{jar:h,data:{...input,hostInvite:f.beta.issueInvite(),flow:'legacy'}})).body.code,'BETA_FLOW_REQUIRED');f.tick(600001);assert.equal((await f.request('/api/gather',{jar:h,data:{...input,hostInvite:f.beta.issueInvite(),policyVersion:'old'}})).body.code,'POLICY_REQUIRED');assert.equal(f.state.usage('').total,0);
 }finally{await f.close();}
});
test('room code grants no read/export/join; a fragment capability is exchanged for this browser only',async()=>{
 const f=await fixture();try{const h=await f.ticket(),p=await f.ticket(),q=await f.ticket(),id=await f.create(h);
  for(const route of [ep(id),ep(id,'export')+'?names=1'])for(const jar of [undefined,p,q]){const r=await f.request(route,{jar});assert.equal(r.status,403);assert(!JSON.stringify(r.body).includes('Fixture room'));}
  assert.equal((await f.request(ep(id,'join'),{jar:p,data:{name:'Nickname',policyVersion:POLICY_VERSION}})).status,403);
  const invitation=await f.admit(id,h,p);const v=await f.request(ep(id),{jar:p});assert.equal(v.status,200);assert(!JSON.stringify(v.body).includes(invitation));assert.equal((await f.request(ep(id),{jar:q})).status,403);await f.join(id,p);assert.equal((await f.request(ep(id,'export'),{jar:p})).status,200);
  assert(!JSON.stringify(f.state.db.prepare('SELECT * FROM sessions').all()).includes(p.cookie.split('=')[1]));
 }finally{await f.close();}
});
test('rotation and lock revoke unjoined viewer admissions; existing participants remain; removed person cannot reuse old invitation',async()=>{
 const f=await fixture();try{const h=await f.ticket(),p=await f.ticket(),q=await f.ticket(),id=await f.create(h);const old=await f.admit(id,h,p);await f.admit(id,h,q);const member=await f.join(id,p);
  assert.equal((await f.request(ep(id,'rotate-invite'),{jar:p,data:{}})).status,403);assert.equal((await f.request(ep(id,'rotate-invite'),{jar:h,view:'host',data:{}})).status,200);
  assert.equal((await f.request(ep(id),{jar:q})).status,403);assert.equal((await f.request(ep(id),{jar:p})).status,200);assert.equal((await f.request(ep(id,'access'),{jar:q,data:{invitation:old}})).status,403);
  const current=await f.admit(id,h,q);await f.request(ep(id,'lock-invites'),{jar:h,view:'host',data:{}});assert.equal((await f.request(ep(id),{jar:q})).status,403);assert.equal((await f.request(ep(id),{jar:p})).status,200);
  await f.request(ep(id,'remove-member'),{jar:h,view:'host',data:{member:member.me.id,confirm:true}});assert.equal((await f.request(ep(id),{jar:p})).status,403);assert.equal((await f.request(ep(id,'access'),{jar:p,data:{invitation:current}})).status,403);assert.equal(f.state.loadRoom(id).members.length,0);
 }finally{await f.close();}
});
test('new cookies cannot reset ingress/session/creation bounds, raw source IP is not persisted, rate records expire',async()=>{
 const f=await fixture();try{for(let i=0;i<60;i++)await f.ticket();assert.equal((await f.request('/api/session',{data:{}})).body.code,'BETA_RATE_LIMIT');const events=f.state.db.prepare('SELECT * FROM creation_events').all();assert(!JSON.stringify(events).includes('198.51.100.10'));assert(events.every(e=>e.session.startsWith('beta:')));f.tick(3600001);f.state.sweep();assert.equal(f.state.db.prepare('SELECT COUNT(*) AS n FROM creation_events').get().n,0);const h=await f.ticket();for(let i=0;i<3;i++)await f.create(h);const q=await f.ticket();assert.equal((await f.request('/api/gather',{jar:q,data:{}})).body.code,'INVITE_INVALID');
 }finally{await f.close();}
});
test('public live authorization is separate, finite, and never enabled by startup or local allowance',async()=>{
 const f=await fixture();try{assert.equal(f.state.livePermitted(),false);assert.throws(()=>authorizePublicQloo(f.state,config(),{ceiling:5,daily:5,room:5,expiresAt:f.state.now()+3600000}),e=>e.code==='PUBLIC_BUDGET_REQUIRED');f.arm({ceiling:2,daily:2,room:2});assert.equal(f.state.policy().localTestAuthorization,null);assert.equal(f.state.livePermitted(),true);const h=await f.ticket(),id=await f.create(h),r=f.state.loadRoom(id);f.beta.allowQloo(r);const a=f.state.reserve(id,snapshotHash(r),'a');f.state.finish(a.id,'success',{entities:[]});f.tick(1001);const b=f.state.reserve(id,snapshotHash(r),'b');f.state.finish(b.id,'success',{entities:[]});f.tick(1001);assert.throws(()=>f.state.reserve(id,snapshotHash(r),'c'),e=>e.code==='BUDGET_EXHAUSTED');f.state.stop();assert.equal(f.state.livePermitted(),false);assert.equal(f.state.usage('').total,2);
 }finally{await f.close();}
});
test('participant deletion purges private/lookup/cache content, preserves other member data and spent/no-retry ledger',async()=>{
 const f=await fixture();try{const h=await f.ticket(),p=await f.ticket(),q=await f.ticket(),id=await f.create(h);await f.admit(id,h,p);await f.admit(id,h,q);await f.join(id,p,'DeleteMe');await f.join(id,q,'KeepMe');await f.request(ep(id,'baseline'),{jar:p,data:{version:0,works:[{title:'PRIVATE_DELETE_TITLE',kind:'movie'}],elements:['PRIVATE_DELETE_WORD'],externalConsent:false}});await f.request(ep(id,'baseline'),{jar:q,data:{version:0,works:[{title:'KEEP_TITLE',kind:'movie'}],elements:['KEEP_WORD'],externalConsent:false}});f.arm();const r=f.state.loadRoom(id);f.beta.allowQloo(r);const a=f.state.reserve(id,snapshotHash(r),'delete-cached');f.state.finish(a.id,'success',{query:{text:'PRIVATE_DELETE_TITLE'},entities:[]});
  assert.equal((await f.request(ep(id,'erase-mine'),{jar:p,data:{}})).status,400);assert.equal((await f.request(ep(id,'erase-room'),{jar:p,data:{confirm:true}})).status,403);assert.equal((await f.request(ep(id,'erase-mine'),{jar:p,data:{confirm:true}})).status,200);
  assert.equal((await f.request(ep(id),{jar:p})).status,403);assert.equal((await f.request(ep(id),{jar:q})).status,200);const raw=JSON.stringify(f.state.db.prepare('SELECT data FROM rooms').all());assert(!raw.includes('PRIVATE_DELETE'));assert(!raw.includes('DeleteMe'));assert(raw.includes('KEEP_WORD'));assert.equal(JSON.parse(f.state.db.prepare('SELECT result FROM attempts').get().result).discarded,true);assert.equal(f.state.usage('').total,1);
  await f.request(ep(id,'erase-room'),{jar:h,view:'host',data:{confirm:true}});assert.equal(f.state.loadRooms().length,0);assert.equal(f.state.usage('').total,1);
 }finally{await f.close();}
});
test('only search title crosses fake Qloo boundary; obvious contact inputs are rejected before transport; in-flight results cannot restore deleted data',async()=>{
 const entered=deferred(),release=deferred();let calls=0,seen;const f=await fixture({transport:async query=>{calls++;seen=query;entered.resolve();return release.promise;}});try{const h=await f.ticket(),p=await f.ticket(),id=await f.create(h);await f.admit(id,h,p);await f.join(id,p,'PRIVATE_NICKNAME');await f.request(ep(id,'baseline'),{jar:p,data:{version:0,works:[{title:'Nujabes',kind:'artist'}],elements:['PRIVATE_OWN_WORD'],externalConsent:false}});f.arm();
  const bad=await f.request(ep(id,'search'),{jar:p,data:{text:'email@example.org',kind:'artist',externalConsent:true}});assert.equal(bad.body.code,'PERSONAL_DATA_REJECTED');assert.equal(calls,0);
  const pending=f.request(ep(id,'search'),{jar:p,data:{text:'Nujabes',kind:'artist',externalConsent:true}});await entered.promise;assert.equal(seen.text,'Nujabes');assert(!JSON.stringify(seen).includes('PRIVATE_'));assert.equal((await f.request(ep(id,'search'),{jar:p,data:{text:'Other',kind:'artist',externalConsent:true}})).body.code,'BETA_RATE_LIMIT');await f.request(ep(id,'erase-mine'),{jar:p,data:{confirm:true}});
  release.resolve({status:200,diagnostic:{childClosed:true,physicalAttempts:1,httpStatus:200,requestHash:(await import('../scripts/qloo-cli-transport.mjs')).cliPlan(seen).requestHash},body:JSON.stringify({success:true,results:{entities:[]}})});const result=await pending;assert.notEqual(result.status,200);assert(!JSON.stringify(f.state.loadRoom(id)).includes('PRIVATE_'));assert.equal(f.state.usage('').total,1);assert.equal(f.state.livePermitted(),true);assert.equal(calls,1);
 }finally{release.resolve({status:500});await f.close();}
});
test('wrong ledger binding fails before altering policy; public authorization cannot be replaced by local startup',async()=>{
 const state=new SecurityState();try{state.configure({enabled:true,confirmedFree:true});const before=JSON.stringify(state.policy());assert.throws(()=>createApp({state,deployment:config()}),e=>e.code==='LEDGER_BINDING_REQUIRED');assert.equal(JSON.stringify(state.policy()),before);}finally{state.close();}
 const f=await fixture();try{f.arm();const {authorizeLocalTest}=await import('../scripts/local-test-admin.mjs');assert.throws(()=>authorizeLocalTest(f.state,500),e=>e.code==='PUBLIC_LEDGER_BOUND');const p=f.state.policy();assert.equal(p.publicBetaAuthorization.ledgerId,'L'.repeat(43));assert.equal(p.localTestAuthorization,null);}finally{await f.close();}
});
test('host logout returns only acknowledgement; forgetting removes owned rooms and own records, and signals browser storage clearing',async()=>{
 const f=await fixture();try{const h=await f.ticket(),p=await f.ticket(),id=await f.create(h);await f.admit(id,h,p);await f.join(id,p);const out=await f.request(ep(id,'host-logout'),{jar:h,view:'host',data:{}});assert.deepEqual(out.body,{loggedOut:true});assert.equal((await f.request(ep(id),{jar:h})).status,403);await f.request(ep(id,'host-login'),{jar:h,view:'host',data:{password:'fixture-only-passphrase'}});const forgot=await f.request('/api/session/forget',{jar:h,data:{}});assert.equal(forgot.status,200);assert(forgot.headers.get('clear-site-data').includes('storage'));assert.equal(f.state.loadRooms().length,0);assert.equal((await f.request(ep(id),{jar:p})).status,404);}finally{await f.close();}
});
test('revoking admission while join body is still arriving cannot create a member from stale ACL',async()=>{
 for(const action of ['lock-invites','rotate-invite']){const f=await fixture();try{const h=await f.ticket(),p=await f.ticket(),id=await f.create(h);await f.admit(id,h,p);const slow=await f.partial(ep(id,'join'),{jar:p,data:{name:'Must not join',policyVersion:POLICY_VERSION}});const revoke=await f.request(ep(id,action),{jar:h,view:'host',data:{}});assert.equal(revoke.status,200);slow.finish();const result=await slow.result;assert.equal(result.status,403,action);assert.equal(f.state.loadRoom(id).members.length,0);}finally{await f.close();}}
});
test('beta startup does not cache private rooms in legacy Workshops; used/expired host invites retain no browser binding',async()=>{
 const f=await fixture();try{const h=await f.ticket(),p=await f.ticket(),invitation=f.beta.issueInvite(),id=await f.create(h,{invite:invitation});assert.equal(f.state.policy().betaSecurity.invites.length,0);assert(!JSON.stringify(f.state.policy().betaSecurity).includes(h.cookie.split('=')[1]));await f.admit(id,h,p);await f.join(id,p);await f.request(ep(id,'baseline'),{jar:p,data:{version:0,works:[{title:'Delete on restart',kind:'movie'}],elements:['Private restart words'],externalConsent:false}});const restarted=createApp({state:f.state,deployment:config()});assert.equal(restarted.workshops.rooms.size,0);await f.request(ep(id,'erase-mine'),{jar:p,data:{confirm:true}});assert(!JSON.stringify([...restarted.workshops.rooms.values()]).includes('Private restart words'));restarted.server.close();f.beta.issueInvite();f.tick(3600001);f.beta.sweep();assert.equal(f.state.policy().betaSecurity.invites.length,0);}finally{await f.close();}
});
test('old24-hour bearer is not accepted as public2-hour session; new ticket rotates it',async()=>{
 const f=await fixture();try{f.state.configure({sessionHours:24});const old=f.state.issue();f.state.configure({sessionHours:2});const jar={cookie:'__Host-cg_session='+old.cookie,csrf:old.session.csrf};assert.equal((await f.request('/api/session',{jar})).status,401);const minted=await f.request('/api/session',{jar,data:{}});assert.equal(minted.status,200);assert.notEqual(minted.headers.get('set-cookie').split(';')[0],jar.cookie);assert(minted.body.expiresAt<=f.state.now()+7200000);}finally{await f.close();}
});
