import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {fixture,ep} from './helpers/public-beta-fixture.mjs';
import {BetaSecurity,POLICY_VERSION} from '../scripts/beta-security.mjs';
import {CloudState} from '../cloudflare/budget.mjs';
import {cloudRuntime} from '../cloudflare/runtime.mjs';
import {CloudMaintenance} from '../cloudflare/maintenance.mjs';
const payload=invitation=>({flow:'cards',title:'Fictional review room',size:3,hostPassword:'fictional-review-password',hostInvite:invitation,policyVersion:POLICY_VERSION});

test('review invitations are hashed, finite, and cannot authorize Qloo',async()=>{
 const f=await fixture();try{
  for(const options of [{expiresAt:f.state.now()-1},{expiresAt:Date.now()+22*86400000},{expiresAt:Date.now()+86400000,maxRooms:13}])assert.throws(()=>f.beta.issueReviewInvite(options),{code:'INVITE_INVALID'});
  const invitation=f.beta.issueReviewInvite({expiresAt:Date.now()+86400000,maxRooms:2});assert.equal(invitation.length,43);assert(!JSON.stringify(f.state.policy()).includes(invitation));assert.equal(f.state.policy().betaSecurity.reviewInvites[0].usedRooms,0);assert.equal(f.state.livePermitted(),false);
  assert(!JSON.stringify(f.beta.publicInfo()).includes('reviewInvites'));
 }finally{await f.close();}
});

test('a shared review key creates isolated rooms without giving access to another room',async()=>{
 const f=await fixture();try{
  const invitation=f.beta.issueReviewInvite({expiresAt:Date.now()+86400000,maxRooms:2}),a=await f.ticket(),b=await f.ticket();
  const first=await f.create(a,{invite:invitation,hostPassword:'fictional-first-password'}),second=await f.create(b,{invite:invitation,hostPassword:'fictional-second-password'});assert.notEqual(first,second);const rows=f.state.db.prepare('SELECT data FROM rooms').all();assert.equal(rows.length,2);assert(!rows.some(row=>row.data.includes(invitation)));assert(!JSON.stringify(f.state.policy()).includes(invitation));assert(!JSON.stringify(f.state.db.prepare('SELECT * FROM sessions').all()).includes(invitation));for(const [id,jar] of [[first,a],[second,b]]){const own=await f.request(ep(id),{jar,view:'host'});assert.equal(own.status,200);assert(!JSON.stringify(own.body).includes(invitation));}
  assert.equal((await f.request(ep(first),{jar:b,view:'host'})).status,403);assert.equal((await f.request(ep(first),{jar:b})).status,403);
  assert.equal((await f.request(ep(first,'access'),{jar:b,data:{invitation}})).status,403);
  assert.throws(()=>f.beta.validateHostInvite(invitation),{code:'INVITE_INVALID'});assert.equal(f.state.policy().betaSecurity.reviewInvites[0].usedRooms,2);
 }finally{await f.close();}
});

test('the final review room allowance is consumed exactly once by simultaneous creates',async()=>{
 const f=await fixture();try{
  const invitation=f.beta.issueReviewInvite({expiresAt:Date.now()+86400000,maxRooms:1}),a=await f.ticket(),b=await f.ticket();
  const results=await Promise.all([a,b].map(jar=>f.request('/api/gather',{jar,view:'host',data:payload(invitation)})));assert.deepEqual(results.map(x=>x.status).sort(),[201,403]);assert.equal(f.state.policy().betaSecurity.reviewInvites[0].usedRooms,1);assert.equal(f.state.loadRooms().length,1);
 }finally{await f.close();}
});

test('failed room creation does not consume review allowance; room removal never refunds it',async()=>{
 const f=await fixture();try{
  const invitation=f.beta.issueReviewInvite({expiresAt:Date.now()+86400000,maxRooms:1}),host=await f.ticket();
  const invalid=await f.request('/api/gather',{jar:host,view:'host',data:{...payload(invitation),size:2}});assert.equal(invalid.status,400);assert.equal(f.state.policy().betaSecurity.reviewInvites[0].usedRooms,0);
  const id=await f.create(host,{invite:invitation});f.beta.eraseRoom(id,f.state.session(host.cookie.split('=')[1]));assert.throws(()=>f.beta.validateHostInvite(invitation),{code:'INVITE_INVALID'});assert.equal(f.state.policy().betaSecurity.reviewInvites[0].usedRooms,1);
 }finally{await f.close();}
});

test('review expiry and revocation apply immediately without waiting for maintenance',async()=>{
 const f=await fixture();try{
  const invitation=f.beta.issueReviewInvite({expiresAt:Date.now()+1000,maxRooms:2});f.tick(2000);assert.throws(()=>f.beta.validateHostInvite(invitation),{code:'INVITE_INVALID'});f.beta.sweep();assert.equal(f.state.policy().betaSecurity.reviewInvites.length,0);
  const next=f.beta.issueReviewInvite({expiresAt:Date.now()+86400000}),ordinary=f.beta.issueInvite();f.beta.revokeReviewInvites();assert.throws(()=>f.beta.validateHostInvite(next),{code:'INVITE_INVALID'});f.beta.validateHostInvite(ordinary);
 }finally{await f.close();}
});

test('review invitations survive cloud restart while Qloo activation still stops',()=>{
 const db=new DatabaseSync(':memory:'),opts={id:'review-restart-fixture',origin:'https://workshop.test',baselineHash:'b'.repeat(64),now:()=>Date.parse('2026-10-23T05:00:00Z')};
 try{const state=new CloudState(db,opts),beta=new BetaSecurity(state,{preview:true}),invitation=beta.issueReviewInvite({expiresAt:opts.now()+86400000});state.configure({enabled:true,publicBetaAuthorization:{expiresAt:opts.now()+3600000}});const restarted=new CloudState(db,opts),after=new BetaSecurity(restarted,{preview:true});after.validateHostInvite(invitation);assert.equal(restarted.livePermitted(),false);assert.equal(restarted.policy().enabled,false);assert.equal(restarted.policy().publicBetaAuthorization,null);}finally{db.close();}
});

test('review invitation operations require operator authentication and bounded exact fields',async()=>{
 const db=new DatabaseSync(':memory:'),origin='https://workshop.test',admin='a'.repeat(64),now=Date.parse('2026-10-23T05:00:00Z'),app=cloudRuntime(db,{id:'review-route-fixture',origin,operatorName:'Fixture',contact:'fixture@workshop.test',now:()=>now});
 const req=(action,data,auth=admin)=>app.handle(new Request(origin+'/api/operator/'+action,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+auth},body:JSON.stringify(data)}),{ip:'198.51.100.10',adminToken:admin});
 try{await assert.rejects(req('review-invite',{expiresAt:now+86400000},'b'.repeat(64)),{code:'HOST_REQUIRED'});await assert.rejects(req('review-invite',{expiresAt:now+86400000,enabled:true}),{code:'INPUT_INVALID'});const data=await(await req('review-invite',{expiresAt:now+86400000,maxRooms:1})).json();assert.equal(data.maxRooms,1);app.beta.validateHostInvite(data.invitation);await req('revoke-review-invites',{});assert.throws(()=>app.beta.validateHostInvite(data.invitation),{code:'INVITE_INVALID'});assert.equal(app.state.livePermitted(),false);}finally{db.close();}
});

test('review invitation expiry is scheduled without repeated writes or per-request polling',async()=>{
 const db=new DatabaseSync(':memory:'),now=Date.parse('2026-10-23T05:00:00Z'),app=cloudRuntime(db,{id:'review-alarm-fixture',origin:'https://workshop.test',operatorName:'Fixture',contact:'fixture@workshop.test',now:()=>now});let alarm=null;
 try{app.beta.issueReviewInvite({expiresAt:now+86400000});const m=new CloudMaintenance(app,{getAlarm:async()=>alarm,setAlarm:async value=>{alarm=value;},deleteAlarm:async()=>{alarm=null;}});m.sweep();const before=db.prepare('SELECT total_changes() AS n').get().n;for(let n=0;n<120;n++)m.sweep();assert.equal(db.prepare('SELECT total_changes() AS n').get().n,before);await m.schedule();assert.equal(alarm,now+86400000);}finally{db.close();}
});


test('cloud review expiry extension keeps the same digest, original issue time and spent room allowance',async()=>{
 const db=new DatabaseSync(':memory:'),origin='https://workshop.test',admin='a'.repeat(64),end=Date.parse('2026-11-17T06:00:00Z');let clock=Date.parse('2026-10-23T05:00:00Z');const opts={id:'extension-fixture',origin,operatorName:'Fixture',contact:'fixture@workshop.test',now:()=>clock};let app=cloudRuntime(db,opts);
 const req=(path,data,extra={})=>app.handle(new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:JSON.stringify(data)}),{ip:'198.51.100.12',adminToken:admin}),op=(action,data)=>req('/api/operator/'+action,data,{Authorization:'Bearer '+admin});
 try{
  assert.throws(()=>app.beta.issueReviewInvite({expiresAt:end+1}),{code:'INVITE_INVALID'});assert.throws(()=>app.beta.issueReviewInvite({expiresAt:clock+31*86400000}),{code:'INVITE_INVALID'});
  const invitation=app.beta.issueReviewInvite({expiresAt:clock+86400000,maxRooms:2}),session=await req('/api/session',{}),ticket=await session.json(),headers={Cookie:session.headers.get('set-cookie').split(';')[0],'X-CG-CSRF':ticket.csrf,'X-CG-View':'host'};
  assert.equal((await req('/api/gather',payload(invitation),headers)).status,201);const before={...app.state.policy().betaSecurity.reviewInvites[0]};assert.equal(before.usedRooms,1);
  const result=await(await op('extend-review-invite',{invitation,expiresAt:end})).json();assert.deepEqual(result,{extended:true,expiresAt:end,maxRooms:2,usedRooms:1});assert(!JSON.stringify(result).includes(invitation));
  const after=app.state.policy().betaSecurity.reviewInvites[0];assert.deepEqual(after,{...before,expires:end});assert(!JSON.stringify(app.beta.publicInfo()).includes(invitation));assert(!JSON.stringify(app.state.operatorStatus()).includes(invitation));assert.equal(app.state.livePermitted(),false);
  assert.equal((await req('/api/gather',payload(invitation),headers)).status,201);assert.throws(()=>app.beta.validateHostInvite(invitation),{code:'INVITE_INVALID'});await assert.rejects(op('extend-review-invite',{invitation,expiresAt:end}),{code:'INVITE_INVALID'});assert.equal(app.state.policy().betaSecurity.reviewInvites[0].usedRooms,2);
  app=cloudRuntime(db,opts);assert.equal(app.state.policy().betaSecurity.reviewInvites[0].usedRooms,2);assert.throws(()=>app.beta.validateHostInvite(invitation),{code:'INVITE_INVALID'});
  const another=app.beta.issueReviewInvite({expiresAt:end});clock=end;assert.throws(()=>app.beta.validateHostInvite(another),{code:'INVITE_INVALID'});await assert.rejects(op('extend-review-invite',{invitation:another,expiresAt:end+1}),{code:'INVITE_INVALID'});
 }finally{db.close();}
});

test('review extension rejects unauthenticated, cross-origin, unknown and extra-field requests without revealing keys',async()=>{
 const db=new DatabaseSync(':memory:'),origin='https://workshop.test',admin='a'.repeat(64),clock=Date.parse('2026-10-23T05:00:00Z'),app=cloudRuntime(db,{id:'extension-authorization-fixture',origin,operatorName:'Fixture',contact:'fixture@workshop.test',now:()=>clock});
 const req=(data,{auth=admin,requestOrigin=origin}={})=>app.handle(new Request(origin+'/api/operator/extend-review-invite',{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json',Authorization:'Bearer '+auth},body:JSON.stringify(data)}),{ip:'198.51.100.13',adminToken:admin});
 try{const invitation=app.beta.issueReviewInvite({expiresAt:clock+86400000,maxRooms:8}),data={invitation,expiresAt:clock+2*86400000};const before=app.state.policy().betaSecurity.reviewInvites;
  for(const options of [{auth:'b'.repeat(64)},{requestOrigin:'https://attacker.test'}])await assert.rejects(req(data,options),e=>!e.message.includes(invitation));
  await assert.rejects(req({...data,usedRooms:0}),{code:'INPUT_INVALID'});await assert.rejects(req({...data,invitation:'z'.repeat(43)}),e=>e.code==='INVITE_INVALID'&&!e.message.includes(invitation));await assert.rejects(req({...data,expiresAt:clock+31*86400000}),{code:'INVITE_INVALID'});assert.deepEqual(app.state.policy().betaSecurity.reviewInvites,before);
  const result=await(await req(data)).json();assert.deepEqual(result,{extended:true,expiresAt:data.expiresAt,maxRooms:8,usedRooms:0});app.beta.revokeReviewInvites();await assert.rejects(req({...data,expiresAt:clock+3*86400000}),{code:'INVITE_INVALID'});assert.equal(app.state.policy().betaSecurity.reviewInvites.length,0);
 }finally{db.close();}
});
