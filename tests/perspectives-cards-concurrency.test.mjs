import test from 'node:test';
import assert from 'node:assert/strict';
import {SecurityState} from '../scripts/security-state.mjs';
import {QlooGuard} from '../scripts/qloo-guard.mjs';
import {PerspectiveMaterials} from '../scripts/perspective-materials.mjs';
import {authorizeLocalTest} from '../scripts/local-test-admin.mjs';
import {createApp} from '../scripts/serve.mjs';
const UUID='11111111-1111-4111-8111-111111111111';
function gate(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function fixture({search,material}={}){
 const state=new SecurityState();
 const guard=new QlooGuard(state,{verifiedSingleAttempt:true,transport:search||(async()=>({status:200,body:JSON.stringify({success:true,results:{entities:[]}})}))});
 const materials=new PerspectiveMaterials(state,{transport:material||(async()=>{throw Error('not expected');})});
 const app=createApp({state,guard,materials,localLive:true});
 authorizeLocalTest(state,500);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
 async function ticket(){const res=await fetch(origin+'/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});return {cookie:res.headers.get('set-cookie').split(';')[0],csrf:(await res.json()).csrf};}
 async function request(id,action,jar,data,view='participant'){const res=await fetch(origin+'/api/gather'+(id?'/'+id:'')+(action?'/'+action:''),{method:data===undefined?'GET':'POST',headers:{Cookie:jar.cookie,'X-CG-View':view,...(data===undefined?{}:{Origin:origin,'Content-Type':'application/json','X-CG-CSRF':jar.csrf})},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:res.status,body:await res.json()};}
 async function room(){const host=await ticket(),a=await ticket(),b=await ticket();const made=await request('',null,host,{flow:'cards',size:3,hostPassword:'fixture-only-password-020'},'host');assert.equal(made.status,201);const id=made.body.id;await request(id,'join',a,{name:'A'});await request(id,'join',b,{name:'B'});for(const p of [a,b])assert.equal((await request(id,'baseline',p,{version:0,works:[{title:'film',kind:'movie'}],elements:['静けさ']})).status,200);return {id,host,a,b};}
 return {state,request,room,close:async()=>{await new Promise(r=>app.server.close(r));state.close();}};
}
test('other participant input and withdrawal cannot cancel an in-flight card material batch',{timeout:10000},async()=>{
 const entered=gate(),release=gate();let calls=0;
 const f=await fixture({material:async q=>{calls++;if(calls===1){entered.resolve();await release.promise;}return {data:{success:true,results:q.kind==='tag'?{tags:[{tag_id:'urn:tag:style:qloo:poetic',name:'Poetic'}]}:{entities:[]}},diagnostic:{childClosed:true,physicalAttempts:1,httpStatus:200}};}});
 try{const {id,a,b}=await f.room();const own=(await f.request(id,null,a)).body.me;f.state.mutateRoom(id,r=>{r.lookups[own.id]=[{id:'qloo-'+UUID,entityId:UUID,title:'verified',kind:'movie'}];});await f.request(id,'baseline',a,{version:1,works:[{id:'qloo-'+UUID}],elements:['余白'],externalConsent:true});await f.request(id,'publish',b,{version:1,elements:['音色']});const pending=f.request(id,'materials',a,{version:2});await Promise.race([entered.promise,pending.then(r=>{throw Error(JSON.stringify(r));})]);assert.equal((await f.request(id,'withdraw',b,{})).status,200);await f.request(id,'resume',b,{});assert.equal((await f.request(id,'baseline',b,{version:4,works:[{title:'another',kind:'movie'}],elements:['疾走感']})).status,200);release.resolve();const result=await pending;assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.me.material.tags[0].original,'Poetic');assert.equal(calls,3);assert.equal(f.state.livePermitted(),true);assert.equal(f.state.usage(id).total,3);
 }finally{release.resolve();await f.close();}
});
test('card searches share a global initial-work queue and reject a stale queued author before sending',{timeout:10000},async()=>{
 const entered=gate(),release=gate();let active=0,max=0,calls=0;
 const f=await fixture({search:async()=>{calls++;active++;max=Math.max(max,active);if(calls===1){entered.resolve();await release.promise;}active--;return {status:200,body:JSON.stringify({success:true,results:{entities:[]}})};}});
 try{const first=await f.room(),second=await f.room();const one=f.request(first.id,'search',first.a,{text:'first',kind:'movie',externalConsent:true});await entered.promise;const stale=f.request(second.id,'search',second.a,{text:'stale',kind:'movie',externalConsent:true});await new Promise(r=>setTimeout(r,50));await f.request(second.id,'baseline',second.a,{version:1,works:[{title:'changed',kind:'movie'}],elements:['別の入力']});release.resolve();assert.equal((await one).status,200);assert.equal((await stale).status,409);assert.equal(calls,1);const next=await f.request(second.id,'search',second.a,{text:'changed',kind:'movie',externalConsent:true});assert.equal(next.status,200);assert.equal(calls,2);assert.equal(max,1);assert.equal(f.state.usage('').total,2);
 }finally{release.resolve();await f.close();}
});
