import { metadataText } from '../web/presentation.js';
import { hash, deny, GuardError, knownExecution, executionDiagnostic } from './security-core.mjs';
const requestHashFor=q=>{const u=new URL(q.operation==='search'?'/search':'/v2/insights','https://hackathon.api.qloo.com');u.searchParams.set(q.operation==='search'?'types':'filter.type','urn:entity:'+q.kind);u.searchParams.set('take',String(q.take));u.searchParams.set(q.operation==='search'?'query':'signal.interests.entities',q.operation==='search'?q.text:q.entities.join(','));u.searchParams.sort();return hash(u.toString());};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validateQuery(input){
 deny(input&&typeof input==='object'&&!Array.isArray(input),400,'QUERY_INVALID','探索条件を確認してください。');
 if(input.operation==='search'){
  deny(Object.keys(input).every(k=>['operation','kind','text','take'].includes(k))&&['movie','artist','book'].includes(input.kind)&&typeof input.text==='string'&&input.text.trim().length>=2&&input.text.length<=80&&!/[\x00-\x1f\x7f]/.test(input.text)&&Number.isInteger(input.take)&&input.take>=1&&input.take<=5,400,'QUERY_INVALID','作品名は2〜80文字で入力してください。');
  return {operation:'search',kind:input.kind,text:input.text.trim(),take:input.take};
 }
 deny(Object.keys(input).every(k=>['kind','entities','take'].includes(k)),400,'QUERY_INVALID','許可された探索条件を指定してください。');
 deny(['movie','artist','book'].includes(input.kind)&&Array.isArray(input.entities)&&input.entities.length>=1&&input.entities.length<=18&&input.entities.every(x=>typeof x==='string'&&UUID.test(x)),400,'QUERY_INVALID','確認済みの作品IDが必要です。');
 const take=input.take??5;deny(Number.isInteger(take)&&take>=1&&take<=10,400,'QUERY_INVALID','候補数は1〜10件です。');return {kind:input.kind,entities:[...new Set(input.entities.map(s=>s.toLowerCase()))].sort(),take};
}
export function parseResponse(text){
 deny(typeof text==='string'&&Buffer.byteLength(text)<=262144,502,'RESPONSE_LIMIT','API応答が上限を超えました。');
 let data;try{data=JSON.parse(text);}catch{throw new GuardError(502,'RESPONSE_INVALID','API応答を読み取れません。');}
 let nodes=0;const check=(v,depth)=>{deny(depth<=12&&++nodes<=20000,502,'RESPONSE_LIMIT','API応答が複雑すぎます。');if(v&&typeof v==='object'){const values=Object.values(v);deny(values.length<=2000,502,'RESPONSE_LIMIT','API応答の件数が上限を超えました。');values.forEach(x=>check(x,depth+1));}};check(data,0);
 const entities=data?.results?.entities;deny(data?.success===true&&Array.isArray(entities)&&entities.length<=10,502,'RESPONSE_INVALID','API応答の形式が想定と違います。');
 return {entities:entities.map(e=>{deny(e&&UUID.test(e.entity_id||'')&&typeof e.name==='string'&&e.name.length>0&&e.name.length<=200,502,'RESPONSE_INVALID','候補のIDと名前を確認できません。');const kind=[e.subtype,...(Array.isArray(e.types)?e.types:[])].find(t=>['urn:entity:movie','urn:entity:artist','urn:entity:book'].includes(t))?.slice(11);const year=e.properties?.release_year;const disambiguation=typeof e.disambiguation==='string'?e.disambiguation.slice(0,180):'';const detail=metadataText([Number.isInteger(year)&&year>=1000&&year<=2100?String(year):'',disambiguation].filter(Boolean).join(' · '),e.name);return {id:e.entity_id.toLowerCase(),title:e.name,...(kind?{kind}:{}),...(detail?{detail}:{})};})};
}
// Exactly one physical attempt per transport call is required. The verified CLI
// boundary and shared reservation ledger enforce this for local live tests.
export class QlooGuard {
 constructor(store,{transport=null,verifiedSingleAttempt=false,timeoutMs=13000}={}){this.store=store;this.transport=transport;this.verified=verifiedSingleAttempt;this.timeoutMs=timeoutMs;this.flights=new Map();this.controllers=new Map();}
 status(room,snapshot){return {...this.store.status(room,snapshot),connected:!!this.transport&&this.verified};}
 // A different take is still the same failed origin/output pair, not a retry escape.
 familyHashes(query){const maximum=query.operation==='search'?5:10;return Array.from({length:maximum},(_,n)=>hash(JSON.stringify({...query,take:n+1})));}
 familyBlocked(query){return this.familyHashes(query).some(h=>this.store.blockedQuery(h));}
 preview(room,snapshot,input){const query=validateQuery(input),job=hash(JSON.stringify({room,snapshot,query,version:1})),old=this.store.db.prepare('SELECT state,result IS NOT NULL AS retained FROM attempts WHERE job=?').get(job);return old?old.state==='success'&&old.retained?(JSON.parse(this.store.db.prepare('SELECT result FROM attempts WHERE job=?').get(job).result).discarded?'removed':'cached'):old.state==='success'?'removed':'blocked':this.familyBlocked(query)?'blocked':'new';}
 async execute(room,snapshot,input){const query=validateQuery(input);deny(this.transport&&this.verified,503,'TRANSPORT_UNAVAILABLE','実APIは未接続です。キーを設定するだけでは開始しません。');const job=hash(JSON.stringify({room,snapshot,query,version:1}));if(this.flights.has(job))return this.flights.get(job);
  const task=this.run(room,snapshot,query,job);this.flights.set(job,task);try{return await task;}finally{this.flights.delete(job);}
 }
 async run(room,snapshot,query,job){const existing=this.store.db.prepare('SELECT state FROM attempts WHERE job=?').get(job);deny(existing||!this.familyBlocked(query),409,'QUERY_ABANDONED','失敗または結果不明の起点・出力分野は、取得件数を変えても再送しません。');const reservation=this.store.reserve(room,snapshot,job,hash(JSON.stringify(query)),this.familyHashes(query));if(reservation.cached)return {cached:true,...reservation.result};
  const controller=new AbortController();this.controllers.set(job,{controller,room,snapshot});let timer,diagnostic=null,settled=false;
  try{
   deny(this.store.stillAllowed(room,snapshot),423,'LIVE_DISABLED','所有者がAPI処理を停止しました。');
   const response=await Promise.race([Promise.resolve().then(()=>this.transport(query,{signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new GuardError(504,'UPSTREAM_TIMEOUT','APIの待ち時間が上限に達しました。再送しません。'));},this.timeoutMs);})]);
   const status=response?.status;diagnostic=executionDiagnostic(response?.diagnostic);
   if(status===401||status===403){this.store.stop();throw new GuardError(502,'UPSTREAM_AUTH','Qlooの認証を確認できません。実接続を停止しました。');}
   if(status===429){this.store.stop();throw new GuardError(429,'UPSTREAM_RATE_LIMIT','Qlooの利用制限に達しました。新規処理を停止しました。');}
   deny(status===200||(status===404&&query.operation==='search'),502,'UPSTREAM_FAILURE','Qlooの応答を確認できません。再送しません。');
   const parsed=response?.status===404&&query.operation==='search'?{entities:[]}:parseResponse(response.body);
   const allowed=this.store.stillAllowed(room,snapshot)&&!controller.signal.aborted;
   if(!allowed)deny(knownExecution(diagnostic,requestHashFor(query)),502,'EXECUTION_UNCONFIRMED','The completed execution could not be verified.');
   const result={...parsed,source:'Qloo',query,attemptId:reservation.id,receivedAt:new Date(this.store.now()).toISOString()};
   this.store.finish(reservation.id,'success',allowed?result:{discarded:true,diagnostic,semanticQueryHash:hash(JSON.stringify(query))});settled=true;
   deny(allowed,409,'RESULT_REMOVED','The result is no longer available and will not be requested again.');return {cached:false,...result};
  }catch(error){
   if(settled)throw error;
   const d=executionDiagnostic(error.diagnostic||diagnostic),known=knownExecution(d,requestHashFor(query));
   try{this.store.finish(reservation.id,known?'failed':'unknown',{...(d?{diagnostic:d}:{}),errorCode:error.code||'UPSTREAM_FAILURE',semanticQueryHash:hash(JSON.stringify(query))});this.store.stop();}catch{}
   if(error instanceof GuardError){if(known)error.diagnostic=d;throw error;}throw new GuardError(502,'UPSTREAM_FAILURE','外部処理を完了できませんでした。再送しません。');}

  finally{clearTimeout(timer);this.controllers.delete(job);}
 }
 stop(){this.store.stop();for(const {controller} of this.controllers.values())controller.abort();}
 revoke(room){this.store.revoke(room);for(const entry of this.controllers.values())if(entry.room===room)entry.controller.abort();}
}
