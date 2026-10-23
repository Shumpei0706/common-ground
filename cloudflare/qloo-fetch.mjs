import {hash,deny,GuardError} from '../scripts/security-core.mjs';
import {validateQuery,parseResponse} from '../scripts/qloo-guard.mjs';
import {materialRequest,parseMaterial} from '../scripts/material-query.mjs';
import {OFFICIAL_ORIGIN} from '../scripts/qloo-endpoint.mjs';
export function searchPlan(input){
 const query=validateQuery(input),search=query.operation==='search',url=new URL(search?'/search':'/v2/insights',OFFICIAL_ORIGIN);
 url.searchParams.set(search?'types':'filter.type','urn:entity:'+query.kind);url.searchParams.set('take',String(query.take));url.searchParams.set(search?'query':'signal.interests.entities',search?query.text:query.entities.join(','));url.searchParams.sort();return {query,url:url.toString(),requestHash:hash(url.toString())};
}
// Raw /search returns results as an array; the pinned official CLI unwraps it.
// Project before the 256 KiB normalized guard, as the CLI does for large metadata.
function normalizeEntities(body,query){
 let data;try{data=JSON.parse(body);}catch{throw new GuardError(502,'RESPONSE_INVALID','Qloo returned an unreadable response.');}
 const raw=query.operation==='search'?data?.results:data?.results?.entities;
 const success=query.operation==='search'?(data?.success===undefined||data.success===true):data?.success===true;
 deny(success&&Array.isArray(raw)&&raw.length<=query.take,502,'RESPONSE_INVALID','Qloo returned an unexpected response.');
 const types=['urn:entity:movie','urn:entity:artist','urn:entity:book'];
 const entities=raw.map(e=>({entity_id:typeof e?.entity_id==='string'?e.entity_id.slice(0,37):null,name:typeof e?.name==='string'?e.name.slice(0,201):null,subtype:types.includes(e?.subtype)?e.subtype:undefined,types:Array.isArray(e?.types)?e.types.filter(t=>types.includes(t)).slice(0,3):[],properties:{release_year:Number.isInteger(e?.properties?.release_year)?e.properties.release_year:undefined},disambiguation:typeof e?.disambiguation==='string'?e.disambiguation.slice(0,180):undefined}));
 return parseResponse(JSON.stringify({success:true,results:{entities}}));
}
// Keep only numeric quota metadata, never cookies, authentication or arbitrary headers.
const quotaHeaderNames=[...['second','minute','hour','day','month'].flatMap(period=>['limit','remaining','reset'].map(field=>`x-${period}-ratelimit-${field}`)),...['limit','remaining','reset'].flatMap(field=>[`x-ratelimit-${field}`,`ratelimit-${field}`]),'retry-after'];
export function createNativeTransport({apiKey,fetchImpl=fetch,timeoutMs=7500}={}){
 let quotaObservation=null;
 const ready=typeof apiKey==='string'&&/^[\x21-\x7e]{8,4096}$/.test(apiKey);
 async function request(plan,{signal}={}){
  deny(ready,503,'KEY_REQUIRED','Qloo is not configured.');deny(!signal?.aborted,423,'LIVE_DISABLED','Qloo is stopped.');
  const url=new URL(plan.url);deny(url.origin===OFFICIAL_ORIGIN&&['/search','/v2/insights'].includes(url.pathname)&&!url.username&&!url.password&&!url.hash&&hash(url.toString())===plan.requestHash,400,'REQUEST_BLOCKED','Invalid Qloo request.');
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,timeoutMs);
  let status=null,closed=false,reader=null;
  const diagnostic=reason=>({transportKind:'fetch',transportClosed:closed,childClosed:false,physicalAttempts:1,httpStatus:status,requestHash:plan.requestHash,boundaryReason:reason||null});
  try{
   // One invocation, one GET. Manual redirects and no application retry.
   const response=await fetchImpl(url.toString(),{method:'GET',headers:{'X-Api-Key':apiKey,Accept:'application/json'},redirect:'manual',signal:controller.signal});status=response.status;
   const headers={};for(const name of quotaHeaderNames){const value=response.headers.get(name);if(value!==null&&/^\d{1,16}$/.test(value))headers[name]=value;}
   quotaObservation={receivedAt:new Date().toISOString(),httpStatus:status,requestHash:plan.requestHash,headers};
   if(status!==200){await response.body?.cancel();closed=true;return {status,body:'',diagnostic:diagnostic()};}
   const length=response.headers.get('content-length');deny(length===null||/^\d+$/.test(length)&&Number(length)<=1048576,502,'RESPONSE_LIMIT','Qloo response exceeded the limit.');
   reader=response.body?.getReader();deny(reader,502,'RESPONSE_INVALID','Qloo response was empty.');
   let size=0;const chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;deny(size<=1048576,502,'RESPONSE_LIMIT','Qloo response exceeded the limit.');chunks.push(value);}
   closed=true;const merged=new Uint8Array(size);let at=0;for(const chunk of chunks){merged.set(chunk,at);at+=chunk.byteLength;}
   return {status,body:new TextDecoder().decode(merged),diagnostic:diagnostic()};
  }catch(e){controller.abort();if(reader)try{await reader.cancel();}catch{}closed=true;const failure=new GuardError(502,e?.code==='RESPONSE_LIMIT'?'RESPONSE_LIMIT':'QLOO_FETCH_FAILED','Qloo could not complete this request. It will not be retried automatically.');failure.diagnostic=diagnostic(status===null?'FETCH_FAILED':e?.code==='RESPONSE_LIMIT'?'RESPONSE_LIMIT':'RESPONSE_READ_FAILED');throw failure;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);try{reader?.releaseLock();}catch{}}
 }
 return {ready,quotaObservation:()=>quotaObservation?structuredClone(quotaObservation):null,
  async search(input,options){const plan=searchPlan(input),r=await request(plan,options);if(r.status===200){try{const d=normalizeEntities(r.body,plan.query);r.body=JSON.stringify({success:true,results:{entities:d.entities.map(e=>({entity_id:e.id,name:e.title,...(e.kind?{subtype:'urn:entity:'+e.kind}:{}),...(e.detail?{disambiguation:e.detail}:{})}))}});}catch(e){e.diagnostic=r.diagnostic;throw e;}}return r;},
  async materials(input,{approval,...options}={}){const plan=materialRequest(input);deny(approval?.endpoint===OFFICIAL_ORIGIN&&approval.requestHash===plan.requestHash&&Number.isSafeInteger(approval.expires)&&approval.expires>Date.now()&&approval.expires<=Date.now()+900000,423,'MATERIAL_APPROVAL','A reserved Qloo request is required.');const r=await request(plan,options);try{deny(r.status===200,502,'UPSTREAM_FAILURE','Qloo rejected the request.');const d=JSON.parse(r.body),tag=t=>({tag_id:t.tag_id,name:t.name,types:t.types,subtype:t.subtype,tag_value:t.tag_value,query:t.query});const data={success:d?.success,results:{...(Array.isArray(d?.results?.tags)?{tags:d.results.tags.map(tag)}:{}),...(Array.isArray(d?.results?.entities)?{entities:d.results.entities.map(e=>({entity_id:e.entity_id,name:e.name,subtype:e.subtype,tags:Array.isArray(e.tags)?e.tags.slice(0,100).map(tag):undefined,query:{affinity:e.query?.affinity,explainability:e.query?.explainability},properties:{release_year:e.properties?.release_year,description:typeof e.properties?.description==='string'?e.properties.description.slice(0,2000):undefined}}))}:{})},query:{explainability:d?.query?.explainability}};return {data:parseMaterial(JSON.stringify(data),plan.query),diagnostic:r.diagnostic};}catch(e){e.diagnostic=r.diagnostic;throw e;}}
 };
}
