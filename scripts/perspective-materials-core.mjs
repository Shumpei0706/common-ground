import {setTimeout as delay} from 'node:timers/promises';
import {hash,deny,snapshotHash,knownExecution,executionDiagnostic} from './security-core.mjs';
import {materialPlan} from './material-query.mjs';
import {OFFICIAL_ORIGIN} from './qloo-endpoint.mjs';
import {baselineHash,materialProjection} from './perspectives.mjs';
export class PerspectiveMaterials{
 constructor(state,{transport,sleep=delay,runtime={}}={}){this.state=state;this.transport=(query,options)=>transport(query,{...options,runtime});this.sleep=sleep;}
 async obtain(room,member,{signalSession=()=>false}={}){
  const state=this.state,version=baselineHash(member),snapshot=snapshotHash(room),plan=materialPlan(member.private.baseline.works),rows=[];
  const job=q=>hash(JSON.stringify({experience:'perspectives',room:room.id,requestHash:q.requestHash}));
  const current=(requireLive=true)=>{const r=state.loadRoom(room.id),m=r.members.find(m=>m.id===member.id&&m.browser===member.browser&&!m.synthetic);deny(signalSession()&&r.experience==='perspectives'&&m&&m.status==='preparing'&&m.private.externalConsent&&!m.published&&['prepare','listen'].includes(r.stage)&&baselineHash(m)===version&&snapshotHash(r)===snapshot&&state.status(room.id,snapshot).allowed&&(!requireLive||state.stillAllowed(room.id,snapshot)),423,'MATERIAL_CHANGED','入力・同意・進行または許可が変わりました。');return m;};
  current(false);deny(!plan.some(q=>{const row=state.db.prepare("SELECT state,result FROM attempts WHERE job=?").get(job(q));return row?.state==='success'&&(!row.result||JSON.parse(row.result).discarded);}),409,'RESULT_REMOVED','These cached results were removed and will not be fetched again.');const budget=state.status(room.id,snapshot),needed=plan.filter(q=>!state.db.prepare("SELECT 1 FROM attempts WHERE job=? AND state='success' AND result IS NOT NULL").get(job(q))).length;
  if(needed)current();
  deny(needed<=Math.min(budget.limits.total-budget.used.total,budget.limits.daily-budget.used.daily,budget.limits.room-budget.used.room),429,'MATERIAL_BUDGET','すべての手がかりに必要な利用枠がありません。');
  deny(!plan.some(q=>q.family.some(h=>state.blockedQuery(h))),409,'QUERY_ABANDONED','失敗した照会は再送しません。');
  try{
   for(const q of plan){
    const last=state.db.prepare('SELECT MAX(start) AS n FROM attempts').get().n;await this.sleep(Math.max(0,state.policy().intervalMs-(state.now()-(last||0))));current(false);
    const cached=state.db.prepare("SELECT result FROM attempts WHERE job=? AND state='success' AND result IS NOT NULL").get(job(q));if(cached){rows.push(JSON.parse(cached.result));continue;}current();
    const reservation=state.reserve(room.id,snapshot,job(q),q.semanticQueryHash,q.family);
    if(reservation.cached){rows.push(reservation.result);continue;}
    let diagnostic=null,settled=false;const controller=new AbortController();
    // Only an explicit API stop/expired budget may abort physical work. Domain changes drain it.
    const watcher=setInterval(()=>{if(!state.livePermitted())controller.abort();},100);watcher.unref?.();
    try{
     current();const response=await this.transport(q.query,{approval:{endpoint:OFFICIAL_ORIGIN,requestHash:q.requestHash,expires:Date.now()+60000},signal:controller.signal});diagnostic=executionDiagnostic(response.diagnostic);
     const result={query:q.query,data:response.data,attemptId:reservation.id,receivedAt:new Date(state.now()).toISOString(),requestHash:q.requestHash,diagnostic};
     let valid=true;try{current(false);}catch{valid=false;}
     if(!valid)deny(knownExecution(diagnostic,q.requestHash),502,'EXECUTION_UNCONFIRMED','The completed execution could not be verified.');
     state.finish(reservation.id,'success',valid?result:{discarded:true,diagnostic,semanticQueryHash:q.semanticQueryHash});settled=true;
     deny(valid,409,'MATERIAL_CHANGED','Input changed; the completed result was removed without a retry.');rows.push(result);
    }catch(e){if(!settled){const d=executionDiagnostic(e.diagnostic||diagnostic),known=knownExecution(d,q.requestHash);state.finish(reservation.id,known?'failed':'unknown',{...(d?{diagnostic:d}:{}),errorCode:e.code||'MATERIAL_FAILURE',semanticQueryHash:q.semanticQueryHash});state.stop();}throw e;}finally{clearInterval(watcher);}

   }
   return {...materialProjection(rows,member.private.baseline.works,{cards:room.flow==='cards'}),state:'complete',recorded:false,note:'Qlooから取得した、作品の周辺にある手がかりです。表示する語を種類で絞っています。'};
  }catch(e){if(rows.length&&signalSession()){try{current(false);return {...materialProjection(rows,member.private.baseline.works,{cards:room.flow==='cards'}),state:'partial',recorded:false,note:'一部の手がかりだけ取得できました。取得できた範囲で進められます。'};}catch{}}throw e;}
 }
}
