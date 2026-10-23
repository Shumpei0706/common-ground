import {BetaSecurity,readDeployment,verifyPublicLedger} from './beta-security.mjs';
import {authorizeLocalTest,allowLocalRoom} from './local-test-admin.mjs';
import {onboardingMedia} from './onboarding-media.mjs';
import {perspectiveRoutes} from './perspectives-http.mjs';
import {PerspectiveMaterials} from './perspective-materials.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workshops, Problem, catalog, modes } from './workshop.mjs';
import { exportCard } from './export.mjs';
import { SecurityState, GuardError, deny, same, hash as hashSession, snapshotHash, STATE_PATH } from './security-state.mjs';
import { QlooGuard, validateQuery } from './qloo-guard.mjs';
import { cliPlan, createCliTransport } from './qloo-cli-transport.mjs';
import { OFFICIAL_ORIGIN } from './qloo-installation.mjs';
import { analysisPlan, crossDomainPlan, kindNames } from './cultural-connections.mjs';
import { setTimeout as delay } from 'node:timers/promises';
const root=path.resolve(fileURLToPath(new URL('../web/',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const COOKIE='cg_session';
// Wider first-hop retrieval; the number of physical requests is unchanged.
export const DISCOVERY_TAKE=10;
export const cookieValueFor=(req,name=COOKIE)=>{const entries=(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));return entries.length===1?entries[0].slice(name.length+1):null;};
const cookieHeader=(value,expires=false)=>`${COOKIE}=${value||''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expires?0:86400}`;
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
async function body(req){deny(req.headers['content-type']?.split(';')[0]==='application/json',415,'JSON_REQUIRED','JSON形式が必要です。');let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;deny(size<=16384,413,'INPUT_LIMIT','入力が長すぎます。');chunks.push(chunk);}let data;try{data=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new GuardError(400,'INPUT_INVALID','入力を読み取れません。');}deny(data&&typeof data==='object'&&!Array.isArray(data),400,'INPUT_INVALID','入力を確認してください。');return data;}
function hostOrigin(req){deny(!req.headers.forwarded&&!Object.keys(req.headers).some(k=>k.startsWith('x-forwarded-')),403,'PROXY_DENIED','Use public-beta mode behind a proxy.');const port=req.socket.localPort;deny([`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host),403,'HOST_DENIED','この接続先では操作できません。');return 'http://'+req.headers.host;}
function credential(r,session,view){if(!session)return '';if(view==='host')return r.browserOwner===session.digest?r.hostToken:'';return r.members.find(m=>m.browser===session.digest)?.token||'';}
export function createApp({dbPath=':memory:',state=new SecurityState(dbPath),guard=new QlooGuard(state),materials=null,localLive=false,deployment=null,entityMap=Object.freeze({})}={}){
 // Restart never re-arms live access. An owner must explicitly re-enable it.
 deny(!(deployment&&localLive),503,'MODE_CONFLICT','Public and local API modes cannot be combined.');
 const beta=deployment?new BetaSecurity(state,deployment):null,cookieName=beta&&!beta.config.preview?'__Host-cg_session':COOKIE;
 const cookieValue=req=>cookieValueFor(req,cookieName);
 const setCookie=(value,expires=false)=>beta?`${cookieName}=${value||''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expires?0:7200}${beta.config.preview?'':'; Secure'}`:cookieHeader(value,expires);
 state.stop();
 const analyses=new Map(),searches=new Map();
 const workshops=new Workshops();if(!beta)for(const r of state.loadRooms())workshops.rooms.set(r.id,r);
 async function authorizedBody(req,session){const data=await body(req);deny(state.session(cookieValue(req))?.digest===session.digest,401,'SESSION_REQUIRED','参加券が失効しました。入り直してください。');return data;}
 function project(r,session,view){const token=view==='display'?'':credential(r,session,view);const data=workshops.view(r,token);if(view==='host'){deny(session,401,'SESSION_REQUIRED','主催者の参加券が失効しました。入り直してください。');deny(r.browserOwner===session.digest,403,'HOST_REQUIRED','主催者の参加券が必要です。');data.apiSafety={...guard.status(r.id,snapshotHash(r)),eligible:eligible(r).length>0,discovery:discoveryPreview(r)};}data.searching=(searches.get(r.id)||0)>0;data.externalSearch={connected:!!guard.transport&&guard.verified,enabled:state.livePermitted(),allowed:state.status(r.id,snapshotHash(r)).allowed};return data;}
 function eligible(r,kind='movie'){return analysisPlan(r,kind,entityMap);}
 async function pace(){const last=state.db.prepare('SELECT MAX(start) AS time FROM attempts').get().time;const wait=last===null?0:state.policy().intervalMs-(state.now()-last);if(wait>0)await delay(Math.min(wait,1000));}
 function discoveryPreview(r,kinds=null){
  const snapshot=snapshotHash(r),plan=kinds?eligible(r,kinds):crossDomainPlan(r,entityMap),status=guard.status(r.id,snapshot);
  const states=plan.map(origin=>guard.preview(r.id,snapshot,{kind:origin.kind,entities:[origin.entityId],take:DISCOVERY_TAKE}));
  const fresh=states.filter(x=>x==='new').length,blocked=states.some(x=>x==='blocked');
  const remaining=Math.max(0,Math.min(status.limits.total-status.used.total,status.limits.daily-status.used.daily,status.limits.room-status.used.room));
  return {origins:new Set(plan.map(x=>x.entityId)).size,total:plan.length,fresh,cached:states.filter(x=>x==='cached').length,remaining,blocked,budgetFits:!blocked&&fresh<=remaining};
 }
 async function analyzeRoom(id,kind,ownerCookie){
  const initial=state.loadRoom(id),snapshot=snapshotHash(initial),plan=kind?eligible(initial,kind):crossDomainPlan(initial,entityMap),preview=discoveryPreview(initial,kind);
  deny(plan.length,400,'ENTITIES_REQUIRED','Qlooで選び、照会に同意した作品が必要です。');
  deny(!preview.blocked,409,'JOB_ALREADY_ATTEMPTED','結果不明または失敗した照会が含まれます。自動で再送しません。');
  deny(preview.budgetFits,429,'DISCOVERY_BUDGET','3分野の探索には新規'+preview.fresh+'回が必要ですが、残りは'+preview.remaining+'回です。照会せず地図を使うこともできます。');
  const coverage=()=>Object.fromEntries(['movie','artist','book'].map(k=>[k,{completed:0,total:plan.filter(x=>x.kind===k).length}]));
  state.mutateRoom(id,r=>{r.apiAnalysis={state:'running',completed:0,total:plan.length,kind:kind||'all',coverage:coverage(),plannedFresh:preview.fresh};r.revision++;});
  try{for(const origin of plan){
   await pace();deny(state.session(ownerCookie)?.digest===initial.browserOwner,401,'SESSION_REQUIRED','主催者の参加券が失効しました。');const query={kind:origin.kind,entities:[origin.entityId],take:DISCOVERY_TAKE},result=await guard.execute(id,snapshot,query);
   state.mutateRoom(id,r=>{deny(state.session(ownerCookie)?.digest===initial.browserOwner&&snapshotHash(r)===snapshot&&state.stillAllowed(id,snapshot),423,'LIVE_DISABLED','入力版の許可が変わりました。');r.analysisRecords??=[];const key=cliPlan(query).requestHash;r.analysisRecords=r.analysisRecords.filter(x=>x.requestHash!==key);r.analysisRecords.push({...origin,entities:result.entities,receivedAt:result.receivedAt,attemptId:result.attemptId,requestHash:key});r.apiAnalysis.completed++;r.apiAnalysis.coverage[origin.kind].completed++;r.revision++;});
  }state.mutateRoom(id,r=>{r.apiAnalysis={...r.apiAnalysis,state:'complete'};r.revision++;});
  }catch(error){state.mutateRoom(id,r=>{r.apiAnalysis={...r.apiAnalysis,state:'stopped',message:'探索を停止しました。完了した照会の範囲だけを表示します。',failureCode:error instanceof GuardError?error.code:'UNCLASSIFIED',...(error.diagnostic?{diagnostic:error.diagnostic}:{})};r.revision++;});throw error;}
 }

 const authorizeRoom=beta?r=>beta.allowQloo(r):localLive?r=>{deny(r.flow==='cards'&&!r.sample&&r.experience==='perspectives',423,'LOCAL_SCOPE','このワークだけが実APIの対象です。');allowLocalRoom(state,r.id);}:null;
 const renewSession=(req,res,session,expires)=>{if(!beta||!session)return;const until=state.extendSession(session,expires),seconds=Math.max(1,Math.min(7200,Math.floor((until-state.now())/1000)));res.setHeader('Set-Cookie',`${cookieName}=${cookieValue(req)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${beta.config.preview?'':'; Secure'}`);};
 const gather=perspectiveRoutes({state,guard,materials,authorizedBody,json,cookieValue,authorizeRoom,beta,renewSession});let lastSweep=-Infinity;
 const server=http.createServer(async(req,res)=>{try{
  const origin=beta?beta.origin(req):hostOrigin(req);if(beta)beta.ingress(req);const url=new URL(req.url,origin),decoded=decodeURIComponent(url.pathname);res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(beta&&!beta.config.preview)res.setHeader('Strict-Transport-Security','max-age=31536000');
  if(!beta&&await onboardingMedia(req,res,url))return;
  if(req.method==='POST'){deny(req.headers.origin===origin&&(!req.headers['sec-fetch-site']||req.headers['sec-fetch-site']==='same-origin'),403,'ORIGIN_DENIED','別サイトから操作できません。');}
  if(decoded.startsWith('/api/')){
   if(state.now()-lastSweep>=60000){state.sweep();if(beta)beta.sweep();lastSweep=state.now();}
   const candidateSession=state.session(cookieValue(req)),session=beta&&candidateSession?.expires>state.now()+7200000?null:candidateSession;
   if(decoded==='/api/app-config'&&req.method==='GET')return json(res,200,{beta:beta?.publicInfo()||{enabled:false,preview:true}});
   if(beta)deny(decoded==='/api/session'||decoded==='/api/session/forget'||decoded==='/api/app-config'||decoded==='/api/gather'||/^\/api\/gather\/[A-Fa-f0-9]{6}(?:\/[a-z-]+)?$/.test(decoded),404,'API_MISSING','This operation is unavailable.');
   if(decoded==='/api/session'&&req.method==='GET'){deny(session,401,'SESSION_REQUIRED','参加券を準備してください。');return json(res,200,{mode:'cookie',csrf:session.csrf,sessionRef:hashSession(session.digest),expiresAt:session.expires});}
   if(decoded==='/api/session'&&req.method==='POST'){if(beta&&!session)beta.rate(req,'session',60,1000);await body(req);const result=state.issue(beta&&!session?null:cookieValue(req),{provisional:!!beta});if(result.cookie)res.setHeader('Set-Cookie',setCookie(result.cookie));return json(res,200,{mode:'cookie',csrf:result.session.csrf,sessionRef:hashSession(result.session.digest),expiresAt:result.session.expires});}
   if(decoded==='/api/catalog'&&req.method==='GET')return json(res,200,{catalog,modes});
   if(req.method==='POST'){deny(session,401,'SESSION_REQUIRED','参加券がありません。同じブラウザで開き直してください。');deny(same(req.headers['x-cg-csrf'],session.csrf),403,'CSRF_DENIED','操作の確認情報が一致しません。開き直してください。');}
   if(decoded==='/api/session/forget'&&req.method==='POST'){await authorizedBody(req,session);beta?beta.forget(session):state.forget(session);if(beta)res.setHeader('Clear-Site-Data','"cache", "storage"');res.setHeader('Set-Cookie',setCookie('',true));return json(res,200,{forgotten:true});}
   if(await gather(req,res,url,session))return;
   if(beta)deny(false,404,'API_MISSING','This operation is unavailable.');
   const view=['host','join','room','display'].includes(req.headers['x-cg-view'])?req.headers['x-cg-view']:'display';
   if(decoded==='/api/rooms'&&req.method==='POST'){const data=await authorizedBody(req,session);state.creation(session);const result=state.transaction(()=>{workshops.rooms=new Map(state.loadRooms().map(r=>[r.id,r]));const created=workshops.create(data),r=workshops.room(created.id);r.browserOwner=session.digest;state.saveRoom(r);return {id:r.id};});return json(res,201,result);}
   const match=decoded.match(/^\/api\/rooms\/([A-Za-z0-9]{6})(?:\/(join|submit|withdraw|advance|react|memo|export|analyze|search))?$/);deny(match,404,'API_MISSING','APIが見つかりません。');
   const id=match[1].toUpperCase(),action=match[2],r=state.loadRoom(id);deny(r.experience!=='perspectives',404,'API_MISSING','新しい参加URLから開いてください。');workshops.rooms.set(id,r);
   if(req.method==='GET'&&action==='export'){deny(r.phase!=='collecting',409,'NOT_REVEALED','地図の公開を待ってください。');res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Content-Disposition':`attachment; filename="common-ground-${id.toLowerCase()}.svg"`,'Cache-Control':'no-store'});res.end(exportCard(workshops.view(r,''),url.searchParams.get('names')==='1'));return;}
   if(req.method==='GET'&&!action)return json(res,200,project(r,session,view));
   deny(req.method==='POST'&&action&&action!=='export',405,'METHOD_DENIED','この操作は使えません。');const data=await authorizedBody(req,session);
   if(action==='search'){
    const member=r.members.find(m=>m.browser===session.digest);
    deny(member&&r.phase==='collecting'&&['editing','submitted'].includes(member.status),403,'SEARCH_NOT_ALLOWED','入力中の参加者だけが作品を検索できます。');
    deny(data.externalConsent===true,400,'SEARCH_CONSENT','Qlooに作品名を送る確認が必要です。');
    const query=validateQuery({operation:'search',kind:data.kind,text:data.text,take:5});searches.set(id,(searches.get(id)||0)+1);try{await pace();const fresh=state.loadRoom(id),actor=fresh.members.find(m=>m.browser===session.digest);deny(state.session(cookieValue(req))?.digest===session.digest&&fresh.phase==='collecting'&&actor&&!actor.withdrawn&&['editing','submitted'].includes(actor.status),403,'SEARCH_NOT_ALLOWED','参加状態や進行が変わりました。');
    const result=await guard.execute(id,snapshotHash(r),query);
    const found=result.entities.filter(e=>e.kind===query.kind).map(e=>({id:'qloo-'+e.id,entityId:e.id,title:e.title,kind:kindNames[e.kind],detail:e.detail||'Qlooで照合した作品',mark:e.title.slice(0,1),tone:({movie:'rose',artist:'blue',book:'sage'})[e.kind]}));
    state.mutateRoom(id,current=>{deny(current.phase==='collecting'&&state.session(cookieValue(req))?.digest===session.digest,409,'SEARCH_CHANGED','進行が変わりました。');const m=current.members.find(m=>m.id===member.id);deny(m&&!m.withdrawn,403,'SEARCH_NOT_ALLOWED','参加状態を確認してください。');current.lookups??={};const entries=new Map((current.lookups[m.id]||[]).map(e=>[e.id,e]));for(const e of found)entries.set(e.id,e);current.lookups[m.id]=[...entries.values()].slice(-150);});
    return json(res,200,{entities:found});}finally{searches.set(id,Math.max(0,(searches.get(id)||1)-1));}
   }
   if(action==='analyze'){
    deny(r.browserOwner===session.digest,403,'HOST_REQUIRED','主催者だけが探索を開始できます。');deny(!r.demo&&['map','bridge'].includes(r.phase),409,'NOT_REVEALED','好きの地図を公開してから探索できます。');
    const kind=data.kind??null;deny(kind===null||['movie','artist','book'].includes(kind),400,'QUERY_INVALID','候補の種類を選んでください。');
    const status=guard.status(id,snapshotHash(r));deny(status.connected,503,'TRANSPORT_UNAVAILABLE','実APIは未接続です。安全機構は有効です。');deny(status.enabled&&status.allowed,423,'LIVE_DISABLED','所有者によるこのルームのAPI許可が必要です。');
    if(!analyses.has(id)){const task=analyzeRoom(id,kind,cookieValue(req));analyses.set(id,task);task.finally(()=>analyses.delete(id)).catch(()=>{});}
    await analyses.get(id);return json(res,200,project(state.loadRoom(id),session,view));
   }
   const result=state.mutateRoom(id,current=>{
    workshops.rooms.set(id,current);
    if(action==='join'){const old=current.members.find(m=>m.browser===session.digest);if(old)return {id:old.id};const joined=workshops.join(current,data);current.members.find(m=>m.id===joined.id).browser=session.digest;return {id:joined.id};}
    const role=['advance','memo'].includes(action)?'host':'room',token=credential(current,session,role);deny(token,403,'ROLE_DENIED','この操作をする参加券がありません。');const oldSnapshot=snapshotHash(current),allowedBefore=state.status(id,oldSnapshot).allowed;if(action==='advance')deny(!(searches.get(id)>0),409,'SEARCH_IN_PROGRESS','作品を検索している人がいます。検索が終わってから公開してください。');workshops[action](current,token,data);if(action==='withdraw'&&current.phase!=='collecting')guard.revoke(id);if(action==='advance'&&allowedBefore&&current.phase==='map'){state.grant(id,snapshotHash(current),{cap:state.policy().room,expires:Math.min(current.created+7200000,state.policy().localTestAuthorization?.expiresAt||Date.now()+3600000)});}return null;
   });return json(res,action==='join'?201:200,action==='join'?result:project(state.loadRoom(id),session,view));
  }
  deny(req.method==='GET'||req.method==='HEAD',405,'METHOD_DENIED','この操作は使えません。');deny(!decoded.includes('\0'),400,'PATH_INVALID','Bad path');
  const route=/^\/(?:host\/new|host\/[A-Za-z0-9]{6}|join\/[A-Za-z0-9]{6}|room\/[A-Za-z0-9]{6}(?:\/takeaway)?|display\/[A-Za-z0-9]{6})\/?$/.test(decoded);
  const gathering=['/','/terms','/privacy','/credits'].includes(decoded)||/^\/(?:facilitate\/(?:new|[A-Fa-f0-9]{6})|enter\/[A-Fa-f0-9]{6}|my\/[A-Fa-f0-9]{6}|circle\/[A-Fa-f0-9]{6})\/?$/.test(decoded);
  if(beta)deny(gathering||['/gather.css','/gather.js','/gather.html','/gather-state.js','/gather-i18n.js','/gather-cards-copy.js','/gather-cards-copy.en.js','/gather-policy-copy.js','/qloo-feature-labels.js','/qloo-feature-labels.en.js'].includes(decoded),404,'PAGE_MISSING','This page is unavailable.');
  const dest=path.resolve(root,'.'+(gathering?'/gather.html':route?'/index.html':decoded));deny(dest===root||dest.startsWith(root+path.sep),403,'PATH_DENIED','Forbidden');const content=await readFile(dest);res.writeHead(200,{'Content-Type':types[path.extname(dest)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:content);
 }catch(err){const known=err instanceof Problem||err instanceof GuardError;json(res,known?err.status:503,{error:known?err.message:'処理を安全に完了できませんでした。',code:known?err.code||'WORKSHOP_ERROR':'SERVICE_UNAVAILABLE'});}});
 server.requestTimeout=10000;server.headersTimeout=15000;server.keepAliveTimeout=5000;server.maxConnections=100;server.maxRequestsPerSocket=100;server.on('clientError',(_error,socket)=>{if(socket.writable)socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
 const housekeeping=setInterval(()=>{try{if(state.now()-lastSweep>=60000){state.sweep();if(beta)beta.sweep();lastSweep=state.now();}for(const [id,r] of workshops.rooms)if(r.created+7200000<=state.now())workshops.rooms.delete(id);}catch{try{guard.stop();}catch{}}},60000);housekeeping.unref();server.on('close',()=>clearInterval(housekeeping));
 return {server,state,guard,workshops,beta};
}
export const app=createApp();export const server=app.server;
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const publicMode=process.argv.includes('--public-beta'),previewMode=process.argv.includes('--beta-preview');
  deny(!(publicMode&&previewMode)&&!((publicMode||previewMode)&&process.argv.some(x=>['--local-live','--qloo-local-test'].includes(x))),503,'MODE_CONFLICT','Choose one mode.');
  const deployment=publicMode?readDeployment(process.env.CG_DEPLOYMENT_FILE):previewMode?{preview:true}:null;
  if(deployment&&!deployment.preview)verifyPublicLedger(deployment);
  const state=new SecurityState(deployment&&!deployment.preview?deployment.statePath:STATE_PATH),localLive=process.argv.includes('--local-live'),connected=localLive||process.argv.includes('--qloo-local-test')||publicMode;
  const home=deployment&&!deployment.preview?deployment.qlooHome:undefined;
  const guard=connected?new QlooGuard(state,{verifiedSingleAttempt:true,transport:(query,options)=>createCliTransport({endpoint:OFFICIAL_ORIGIN,requestHash:cliPlan(query).requestHash,expires:Date.now()+60000},home?{home}:{})(query,options)}):new QlooGuard(state);
  const materials=connected?new PerspectiveMaterials(state,{...(home?{runtime:{home}}:{})}):null;
  const runtime=createApp({state,guard,materials,localLive,deployment});if(localLive)authorizeLocalTest(state,500);
  runtime.server.on('error',()=>{console.error('Preview stopped; check ledger and port.');process.exitCode=1;runtime.state.close();});
  runtime.server.listen(4173,'127.0.0.1',()=>console.log('Common Ground: http://127.0.0.1:4173 — '+(deployment?'invite-only beta; Qloo OFF until separate public authorization':localLive?'local Qloo enabled; cumulative500/daily200/room30; expires2h':'live API OFF')));
 }
 catch{console.error('安全な状態を確認できないため起動を停止しました。台帳を確認してください。');process.exitCode=1;}
}
