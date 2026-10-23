import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {cloudRuntime} from '../cloudflare/runtime.mjs';
import {CloudMaintenance} from '../cloudflare/maintenance.mjs';
import {snapshotHash} from '../scripts/security-core.mjs';
import {CloudIngress} from '../cloudflare/ingress.mjs';

function fixture(){
 let now=Date.parse('2026-10-22T07:00:00Z'),alarm=null,sweeps=0;const db=new DatabaseSync(':memory:');
 const app=cloudRuntime(db,{id:'maintenance-fixture',origin:'https://workshop.test',operatorName:'Fixture',contact:'fixture@workshop.test',now:()=>now});
 const original=app.state.sweep.bind(app.state);app.state.sweep=()=>{sweeps++;original();};
 const storage={getAlarm:async()=>alarm,setAlarm:async value=>{alarm=value;},deleteAlarm:async()=>{alarm=null;}};
 const maintenance=new CloudMaintenance(app,storage);
 return {app,db,storage,maintenance,sweeps:()=>sweeps,alarm:()=>alarm,now:()=>now,tick:ms=>{now+=ms;},close:()=>db.close()};
}

test('request cleanup is bounded to one sweep per minute and clock rollback cannot postpone it',()=>{
 const f=fixture();try{assert.equal(f.maintenance.sweep(),true);for(let i=0;i<120;i++)assert.equal(f.maintenance.sweep(),false);assert.equal(f.sweeps(),1);f.tick(59999);assert.equal(f.maintenance.sweep(),false);f.tick(1);assert.equal(f.maintenance.sweep(),true);assert.equal(f.sweeps(),2);f.tick(-1);assert.equal(f.maintenance.sweep(),true);}finally{f.close();}
});

test('throttled cleanup never extends room, session, grant or host invitation authorization',()=>{
 const f=fixture();try{
  const s=f.app.state,room={id:'ABCDEF',created:f.now()-7200000+1000,snapshot:[],members:[]};s.saveRoom(room);
  const ticket=s.issue(null,{provisional:true});f.db.prepare('UPDATE sessions SET expires=? WHERE digest=?').run(f.now()+1000,ticket.session.digest);
  s.grant(room.id,snapshotHash(room),{cap:1,expires:f.now()+1000});const invitation=f.app.beta.issueInvite({expiresInMs:1000});
  f.maintenance.sweep();assert(s.loadRoom(room.id));assert(s.session(ticket.cookie));f.tick(1001);assert.equal(f.maintenance.sweep(),false);
  assert(f.db.prepare('SELECT id FROM rooms WHERE id=?').get(room.id),'Physical record remains until alarm');
  assert.throws(()=>s.loadRoom(room.id),{code:'ROOM_MISSING'});assert.equal(s.session(ticket.cookie),null);assert.equal(s.status(room.id,snapshotHash(room)).allowed,false);assert.throws(()=>f.app.beta.validateHostInvite(invitation),{code:'INVITE_INVALID'});
  f.maintenance.sweep({force:true});assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM rooms').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);assert.equal(s.policy().betaSecurity.invites.length,0);
 }finally{f.close();}
});

test('forced alarm scrubs expired contents while retaining spent slots and uncertainty proof',()=>{
 const f=fixture();try{
  const s=f.app.state,r={id:'ABCDEF',created:f.now()-7200000+1000,snapshot:[],members:[]};s.saveRoom(r);
  f.db.prepare('INSERT INTO attempts(job,room,day,start,state,result) VALUES (?,?,?,?,?,?)').run('a'.repeat(64),r.id,'2026-10-22',f.now(),'unknown',JSON.stringify({privateInput:'PRIVATE_CONTENT',semanticQueryHash:'b'.repeat(64),diagnostic:{transportKind:'fetch',transportClosed:true,physicalAttempts:1,httpStatus:200,requestHash:'c'.repeat(64)}}));
  f.maintenance.sweep();f.tick(1001);f.maintenance.sweep({force:true});const row=f.db.prepare('SELECT state,result FROM attempts').get(),value=JSON.parse(row.result);
  assert.equal(row.state,'unknown');assert.equal(value.discarded,true);assert(!row.result.includes('PRIVATE_CONTENT'));assert.equal(value.diagnostic.physicalAttempts,1);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n,1);assert.equal(s.operatorStatus().unsettled,1);assert.equal(s.livePermitted(),false);
 }finally{f.close();}
});

test('alarms respect the nearest expiry and retain at most a one-minute cleanup delay',async()=>{
 const f=fixture();try{const now=f.now();f.app.state.saveRoom({id:'ABCDEF',created:now-7200000+1000,snapshot:[]});await f.maintenance.schedule();assert.equal(f.alarm(),now+1000);f.tick(1001);f.maintenance.sweep({force:true});await f.maintenance.schedule();assert.equal(f.alarm(),null);f.app.state.issue(null,{provisional:true});await f.maintenance.schedule();assert.equal(f.alarm(),f.now()+600000);}finally{f.close();}
});

test('a failed cleanup is not cached as completed and the next request must try it again',()=>{
 const f=fixture();try{const sweep=f.app.state.sweep;f.app.state.sweep=()=>{throw Error('SQLite unavailable');};assert.throws(()=>f.maintenance.sweep(),/SQLite unavailable/);assert.equal(f.maintenance.lastSweep,null);f.app.state.sweep=sweep;assert.equal(f.maintenance.sweep(),true);}finally{f.close();}
});

test('time and expiry queries use covering indexes rather than scanning live event history',()=>{
 const f=fixture();try{for(const [sql,index] of [
  ['SELECT MIN(time) FROM creation_events','creation_events_time'],
  ['DELETE FROM creation_events WHERE time<=?','creation_events_time'],
  ['SELECT MIN(expires) FROM rooms','rooms_expires'],
  ['SELECT MIN(expires) FROM sessions','sessions_expires']
 ]){const args=sql.includes('?')?[f.now()]:[],plan=f.db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args).map(x=>x.detail).join(' ');assert(plan.includes(index),plan);assert(!plan.includes('SCAN creation_events'),plan);}}finally{f.close();}
});


test('cloud coarse ingress avoids persistent writes while critical action limits survive restart',()=>{
 const f=fixture();try{const b=f.app.beta,ingress=new CloudIngress(b),req={url:'/api/gather/ABCDEF',method:'GET',headers:{'x-real-ip':'198.51.100.1'}};
  const changes=f.db.prepare('SELECT total_changes() AS n').get().n;for(let n=0;n<120;n++)ingress.check(req);assert.equal(f.db.prepare('SELECT total_changes() AS n').get().n,changes);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM creation_events').get().n,0);
  b.rate(req,'login-attempt',1);assert.throws(()=>b.rate(req,'login-attempt',1),{code:'BETA_RATE_LIMIT'});const restarted=cloudRuntime(f.db,{id:'maintenance-fixture',origin:'https://workshop.test',operatorName:'Fixture',contact:'fixture@workshop.test',now:f.now});assert.throws(()=>restarted.beta.rate(req,'login-attempt',1),{code:'BETA_RATE_LIMIT'});
 }finally{f.close();}
});

test('cloud coarse caps bound identity churn and are separate from permanent Qloo accounting',()=>{
 const f=fixture();try{const ingress=new CloudIngress(f.app.beta);for(let n=0;n<600;n++)ingress.check({url:'/api/app-config',method:'GET',headers:{'x-real-ip':'2001:db8:'+n.toString(16)+'::1'}});assert(ingress.sources.size<=600);assert.throws(()=>ingress.check({url:'/api/app-config',method:'GET',headers:{'x-real-ip':'198.51.100.1'}}),{code:'BETA_RATE_LIMIT'});assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM creation_events').get().n,0);f.tick(60001);ingress.check({url:'/api/app-config',method:'GET',headers:{'x-real-ip':'198.51.100.1'}});assert.equal(f.app.state.usage('').total,214);}finally{f.close();}
});

test('alarm timing coalesces nearby expiries without extending their logical lifetime',async()=>{
 const f=fixture();try{const now=f.now();f.app.state.saveRoom({id:'ABCDEF',created:now-7200000+1000,snapshot:[]});f.maintenance.sweep();await f.maintenance.schedule();assert.equal(f.alarm(),now+60000);f.tick(1001);assert.throws(()=>f.app.state.loadRoom('ABCDEF'),{code:'ROOM_MISSING'});f.tick(58999);f.maintenance.sweep({force:true});assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM rooms').get().n,0);await f.maintenance.schedule();assert.equal(f.alarm(),null);}finally{f.close();}
});
