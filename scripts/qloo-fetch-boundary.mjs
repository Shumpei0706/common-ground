// Loaded only in the official CLI child. No credential is read here.
import { createHash } from 'node:crypto';
import { OFFICIAL_ORIGIN } from './qloo-installation.mjs';
const originalFetch=globalThis.fetch;
const mode=process.env.CG_QLOO_MODE;
const expected=process.env.CG_QLOO_REQUEST_HASH;
let started=false;
const safeError=(reason='REQUEST_BLOCKED')=>{process.send?.({type:'qloo-reject',reason});return Error('COMMON_GROUND_QLOO_BOUNDARY');};
function canonical(value){const url=new URL(String(value));url.searchParams.sort();return url.toString();}
globalThis.fetch=async(input,options={})=>{
 if(mode!=='live'||started)throw safeError();
 const url=new URL(String(input));
 if(url.origin!==OFFICIAL_ORIGIN||!['/v2/insights','/search'].includes(url.pathname)||url.username||url.password||url.hash||(options.method||'GET')!=='GET'||createHash('sha256').update(canonical(url)).digest('hex')!==expected)throw safeError();
 started=true;
 process.send?.({type:'qloo-attempt'});
 const signal=AbortSignal.timeout(7500);
 let response;try{response=await originalFetch(url,{...options,redirect:'error',signal});}catch{throw safeError('FETCH_FAILED');}
 process.send?.({type:'qloo-status',status:response.status});
 if(!response.ok){await response.body?.cancel();return new Response(JSON.stringify({message:'Qloo request rejected'}),{status:response.status,headers:{'Content-Type':'application/json'}});}
 const maximum=1048576,length=response.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maximum)){await response.body?.cancel();throw safeError('RESPONSE_LIMIT');}
 const reader=response.body?.getReader();if(!reader)throw safeError();
 let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum)throw safeError('RESPONSE_LIMIT');chunks.push(Buffer.from(value));}}
 catch{await reader.cancel().catch(()=>{});throw safeError('RESPONSE_READ_FAILED');}
 finally{reader.releaseLock();}
 return new Response(Buffer.concat(chunks),{status:response.status,headers:{'Content-Type':'application/json'}});
};
