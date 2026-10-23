import {Buffer} from 'node:buffer';
import {SecurityCore,deny,hash,same,GuardError} from '../scripts/security-core.mjs';
import {BetaSecurity,POLICY_VERSION} from '../scripts/beta-security.mjs';
import {QlooGuard} from '../scripts/qloo-guard.mjs';
import {perspectiveRoutes} from '../scripts/perspectives-http.mjs';
import {CloudState} from './budget.mjs';
import {CloudIngress} from './ingress.mjs';
import {createNativeTransport} from './qloo-fetch.mjs';
import {PerspectiveMaterials} from '../scripts/perspective-materials-core.mjs';
export {assets,page} from './public-files.mjs';
export function secureHeaders(){return new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=()','X-Frame-Options':'DENY','Cross-Origin-Opener-Policy':'same-origin','X-Robots-Tag':'noindex, nofollow','Strict-Transport-Security':'max-age=31536000'});}
export const errorResponse=e=>new Response(JSON.stringify({error:e instanceof GuardError?e.message:'The service is temporarily unavailable.',code:e instanceof GuardError?e.code:'SERVICE_UNAVAILABLE'}),{status:e instanceof GuardError?e.status:503,headers:{...Object.fromEntries(secureHeaders()),'Content-Type':'application/json; charset=utf-8'}});
export async function readBody(request,maximum=16384){
 deny(request.headers.get('content-type')?.split(';')[0]==='application/json',415,'JSON_REQUIRED','JSON is required.');const reader=request.body?.getReader();let size=0,parts=[],timer;
 try{if(reader){const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new GuardError(408,'INPUT_TIMEOUT','Input timed out.')),10000);});while(true){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;size+=value.byteLength;deny(size<=maximum,413,'INPUT_LIMIT','Input is too long.');parts.push(value);}}}finally{clearTimeout(timer);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}}
 let data;try{data=JSON.parse(new TextDecoder().decode(Buffer.concat(parts)));}catch{throw new GuardError(400,'INPUT_INVALID','Check the input.');}deny(data&&typeof data==='object'&&!Array.isArray(data),400,'INPUT_INVALID','Check the input.');return data;
}

export function cloudRuntime(db,{id,origin,operatorName,contact,baselineHash,apiKey,fetchImpl,versionId=null,now=()=>Date.now()}={}){
 const state=new CloudState(db,{id,origin,baselineHash,versionId,now});
 // Bootstrap only this namespace's own private invite secret; never copy local secrets/room data.
 new BetaSecurity(state,{preview:true});if(!state.policy().cloudImport)state.configure({enabled:false,total:1000,daily:200,room:30});
 const beta=new BetaSecurity(state,{publicOrigin:origin,statePath:'/cloudflare/durable-ledger',qlooHome:'/cloudflare/no-qloo-credential',operatorName,contact,hostingProvider:'Cloudflare Workers and Durable Objects',hostingRegion:'Cloudflare global network',logRetentionDays:0,backupRetentionDays:30,reviewedPolicyVersion:POLICY_VERSION,expectedLedgerId:state.policy().betaSecurity.ledgerId,minimumLifetimeSpent:214,ledgerBaselineVerified:true},{validate:c=>{let url;try{url=new URL(c.publicOrigin);}catch{}deny(url&&url.protocol==='https:'&&url.origin===c.publicOrigin&&!url.username&&!url.password&&!/REPLACE|localhost|example/i.test(url.hostname)&&typeof c.operatorName==='string'&&c.operatorName.length>0&&c.operatorName.length<=200&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contact),503,'DEPLOYMENT_INVALID','Complete cloud deployment settings.');return {...c,preview:false};}});
 const ingress=new CloudIngress(beta);
 const transport=createNativeTransport({apiKey,...(fetchImpl?{fetchImpl}:{})}),guard=new QlooGuard(state,transport.ready?{transport:transport.search,verifiedSingleAttempt:true}:{}),materials=transport.ready?new PerspectiveMaterials(state,{transport:transport.materials}):null,cookieName='__Host-cg_session';
 const cookieValue=req=>{const list=(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName+'='));return list.length===1?list[0].slice(cookieName.length+1):null;};
 const cookie=(value,seconds=7200)=>`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${seconds}`;
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 const authorizedBody=async(req,session)=>{const body=await req.body();deny(state.session(cookieValue(req))?.digest===session?.digest,401,'SESSION_REQUIRED','Open the room again.');return body;};
 const renewSession=(req,res,session,expires)=>{const until=state.extendSession(session,expires);deny(until,401,'SESSION_REQUIRED','Open the room again.');res.setHeader('Set-Cookie',cookie(cookieValue(req),Math.max(1,Math.floor((until-now())/1000))));};
 const gather=perspectiveRoutes({state,guard,materials,authorizeRoom:r=>beta.allowQloo(r),beta,json,cookieValue,authorizedBody,renewSession});
 async function handle(request,{ip,adminToken}={}){
  const url=new URL(request.url);deny(url.origin===origin,403,'HOST_DENIED','Invalid origin.');deny(['GET','HEAD','POST'].includes(request.method),405,'METHOD_DENIED','Unsupported method.');
  const req={url:url.pathname+url.search,method:request.method,headers:Object.fromEntries(request.headers),socket:{remoteAddress:'127.0.0.1',localPort:443}};
  req.headers.host=new URL(origin).host;delete req.headers.forwarded;for(const name of Object.keys(req.headers))if(name.startsWith('x-forwarded-'))delete req.headers[name];req.headers['x-forwarded-proto']='https';req.headers['x-real-ip']=ip;
  let read;req.body=()=>read??=readBody(request);let status=200,body=null,ended=false;const headers=secureHeaders(),res={setHeader:(k,v)=>headers.set(k,v),writeHead:(s,h={})=>{status=s;for(const [k,v] of Object.entries(h))headers.set(k,v);},end:value=>{body=value;ended=true;}};
  beta.origin(req);
  const trustedOperator=url.pathname.startsWith('/api/operator/')&&typeof adminToken==='string'&&/^[a-f0-9]{64}$/.test(adminToken)&&same(request.headers.get('authorization')||'','Bearer '+adminToken);
  if(!trustedOperator)ingress.check(req);
  if(request.method==='POST')deny(request.headers.get('origin')===origin&&(!request.headers.get('sec-fetch-site')||request.headers.get('sec-fetch-site')==='same-origin'),403,'ORIGIN_DENIED','Same-origin requests are required.');
  if(url.pathname.startsWith('/api/operator/')){
   deny(request.method==='POST',405,'METHOD_DENIED','Unsupported method.');const auth=request.headers.get('authorization')||'';deny(typeof adminToken==='string'&&/^[a-f0-9]{64}$/.test(adminToken)&&same(auth,'Bearer '+adminToken),403,'HOST_REQUIRED','Operator access is required.');beta.rate(req,'operator-attempt',30,120);
   const action=url.pathname.slice('/api/operator/'.length);deny(['invite','review-invite','extend-review-invite','revoke-review-invites','status','import','arm','stop'].includes(action),404,'API_MISSING','This operation is unavailable.');
   const data=action==='import'?await readBody(request,262144):await req.body();
   if(['invite','revoke-review-invites','status','stop'].includes(action))deny(Object.keys(data).length===0,400,'INPUT_INVALID','This operation takes an empty object.');
   if(action==='invite')json(res,200,{invitation:beta.issueInvite(),expiresInSeconds:3600});
   if(action==='review-invite'){deny(Object.keys(data).every(k=>['expiresAt','maxRooms'].includes(k)),400,'INPUT_INVALID','Unexpected review invitation option.');const invitation=beta.issueReviewInvite(data);json(res,200,{invitation,expiresAt:data.expiresAt,maxRooms:data.maxRooms??8});}
   if(action==='extend-review-invite'){deny(Object.keys(data).every(k=>['invitation','expiresAt'].includes(k)),400,'INPUT_INVALID','Unexpected review invitation option.');json(res,200,beta.extendReviewInvite(data));}
   if(action==='revoke-review-invites'){beta.revokeReviewInvites();json(res,200,{revoked:true});}
   if(action==='status')json(res,200,{...state.operatorStatus(),connected:transport.ready,qlooResponse:transport.quotaObservation()});
   if(action==='import'){deny(Object.keys(data).length===1&&data.manifest,400,'IMPORT_INVALID','A baseline manifest is required.');json(res,200,state.importBudget(data.manifest));}
   if(action==='arm'){deny(transport.ready,503,'KEY_REQUIRED','Configure Qloo before arming.');json(res,200,state.arm(data));}
   if(action==='stop'){guard.stop();json(res,200,state.operatorStatus());}
  }else{
   const candidate=state.session(cookieValue(req)),session=candidate?.expires>now()+7200000?null:candidate;
   deny(url.pathname==='/api/session'||url.pathname==='/api/session/forget'||url.pathname==='/api/app-config'||url.pathname==='/api/gather'||/^\/api\/gather\/[A-Fa-f0-9]{6}(?:\/[a-z-]+)?$/.test(url.pathname),404,'API_MISSING','This operation is unavailable.');
   if(url.pathname==='/api/app-config'&&request.method==='GET')json(res,200,{beta:beta.publicInfo()});
   else if(url.pathname==='/api/session'&&request.method==='GET'){deny(session,401,'SESSION_REQUIRED','Prepare a browser ticket.');json(res,200,{mode:'cookie',csrf:session.csrf,sessionRef:hash(session.digest),expiresAt:session.expires});}
   else if(url.pathname==='/api/session'&&request.method==='POST'){if(!session)beta.rate(req,'session',10,60);await req.body();const result=state.issue(session?cookieValue(req):null,{provisional:true});if(result.cookie)headers.set('Set-Cookie',cookie(result.cookie,600));json(res,200,{mode:'cookie',csrf:result.session.csrf,sessionRef:hash(result.session.digest),expiresAt:result.session.expires});}
   else{if(request.method==='POST'){deny(session,401,'SESSION_REQUIRED','Open the room again.');deny(same(req.headers['x-cg-csrf'],session.csrf),403,'CSRF_DENIED','Open the room again.');}
    if(url.pathname==='/api/session/forget'&&request.method==='POST'){await authorizedBody(req,session);beta.forget(session);headers.set('Clear-Site-Data','"cache", "storage"');headers.set('Set-Cookie',cookie('',0));json(res,200,{forgotten:true});}
    else deny(await gather(req,res,url,session),404,'API_MISSING','This operation is unavailable.');
   }
  }
  deny(ended,503,'SERVICE_UNAVAILABLE','The service is temporarily unavailable.');return new Response(request.method==='HEAD'?null:body,{status,headers});
 }
 return {state,beta,handle};
}
