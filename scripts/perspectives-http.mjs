import {setTimeout as delay} from 'node:timers/promises';
// Unconnected route module: host application supplies its existing CSRF/body checks.
import {deny,snapshotHash} from './security-core.mjs';
import {validateQuery} from './qloo-guard.mjs';
import {familiarity,stages,library,sampleProfiles,createPerspective,mutatePerspective,perspectiveView,perspectiveExport,recordedMaterials,baselineHash,authenticateHost} from './perspectives.mjs';
export function perspectiveRoutes({state,guard,materials=null,authorizedBody,json,cookieValue,authorizeRoom=null,beta=null,renewSession=()=>{}}){
 const flights=new Map(),pendingActors=new Set();let networkTail=Promise.resolve(),queued=0;
 // Serialize initial physical work across card rooms; never retry a transport.
 const network=(fn,actorKey)=>{if(beta){deny(queued<8&&!pendingActors.has(actorKey),429,'BETA_RATE_LIMIT','A request is already running.');pendingActors.add(actorKey);queued++;}const next=networkTail.then(fn,fn);networkTail=next.catch(()=>{});return next.finally(()=>{if(beta){pendingActors.delete(actorKey);queued--;}});};
 const present=(r,session,view)=>{const data=perspectiveView(r,session,view,safety(r));return beta?beta.decorate(r,session,view,data):data;};
 const safety=r=>({...guard.status(r.id,snapshotHash(r)),connected:!!materials,autoAuthorize:!!authorizeRoom&&r.flow==='cards'&&(!beta||!beta.config.preview),searchConnected:!!guard.transport&&guard.verified});
 const actor=(r,session)=>{deny(r.experience==='perspectives',404,'ROOM_MISSING','この場が見つかりません。');const m=session?.digest?r.members.find(m=>!m.synthetic&&typeof m.browser==='string'&&m.browser===session.digest):null;deny(m,403,'MEMBER_REQUIRED','参加したブラウザから開いてください。');return m;};
 return async(req,res,url,session)=>{
  const p=url.pathname;if(!p.startsWith('/api/gather'))return false;
  const view=req.headers['x-cg-view']==='host'?'host':req.headers['x-cg-view']==='participant'?'participant':'display';
  if(p==='/api/gather/config'&&req.method==='GET'){json(res,200,{familiarity,stages,library,sampleProfiles});return true;}
  if(req.method==='POST')deny(session&&state.session(cookieValue(req))?.digest===session.digest,401,'SESSION_REQUIRED','参加したブラウザから開いてください。');
  if(p==='/api/gather'&&req.method==='POST'){const data=await authorizedBody(req,session);if(beta){beta.validateHostInvite(data.hostInvite);beta.rate(req,'create',3,6,600000);}state.creation(session);const create=()=>{deny(state.loadRooms().length<100,429,'ROOM_LIMIT','新しい場の受付を少し待ってください。');return createPerspective(state,session,data);};const r=beta?beta.createRoom(session,data,create):state.transaction(create);renewSession(req,res,session,r.created+7200000);json(res,201,{id:r.id});return true;}
  const match=p.match(/^\/api\/gather\/([A-Fa-f0-9]{6})(?:\/(join|baseline|wording|materials|search|publish|listener|resume|volunteer|stage|turn|ask|confirm|reflection|withdraw|host-login|host-logout|export|access|erase-mine|erase-room|remove-member|lock-invites|rotate-invite))?$/);deny(match,404,'API_MISSING','この操作は見つかりません。');
  const id=match[1].toUpperCase(),action=match[2];const r=state.loadRoom(id);deny(r.experience==='perspectives',404,'ROOM_MISSING','この場が見つかりません。');
  if(beta){deny(r.beta&&r.flow==='cards',404,'ROOM_MISSING','This room is unavailable.');if(!(req.method==='POST'&&['access','host-login'].includes(action))){if(view==='host')deny((r.hostSessions||[]).includes(session?.digest),403,'HOST_REQUIRED','Host access is required.');beta.requireAccess(r,session);}}
  if(req.method==='GET'&&action==='export'){res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Content-Disposition':`attachment; filename="common-ground-${id.toLowerCase()}.svg"`,'Cache-Control':'no-store'});res.end(perspectiveExport(r,url.searchParams.get('names')==='1'));return true;}
  if(req.method==='GET'&&!action){json(res,200,present(r,session,view));return true;}
  deny(req.method==='POST'&&action&&action!=='export',405,'METHOD_DENIED','この操作は使えません。');const data=await authorizedBody(req,session);if(beta&&['join','baseline','search','publish'].includes(action))beta.validateInput(data);
  if(beta&&action==='access'){beta.validateParticipantInvite(r,data.invitation);beta.rate(req,'access-attempt',12,60);beta.admit(id,session,data.invitation);beta.rate(req,'access',30,null,60000,session.digest);renewSession(req,res,session,r.created+7200000);json(res,200,present(state.loadRoom(id),session,'participant'));return true;}
  if(beta&&['erase-mine','erase-room','remove-member'].includes(action)){deny(data.confirm===true,400,'DELETE_CONFIRM_REQUIRED','Confirm permanent deletion.');if(action==='remove-member')deny(typeof data.member==='string'&&/^[a-f0-9]{24}$/.test(data.member),400,'MEMBER_REQUIRED','Choose a participant.');if(action==='erase-room')beta.eraseRoom(id,session);else beta.eraseMember(id,session,action==='remove-member'?data.member:null);json(res,200,{deleted:true});return true;}
  if(beta&&['lock-invites','rotate-invite'].includes(action)){beta.rotate(id,session,action==='lock-invites');json(res,200,present(state.loadRoom(id),session,'host'));return true;}
  if(beta&&action==='join'){deny(data.policyVersion===r.beta.policyVersion,400,'POLICY_REQUIRED','Review the current terms and privacy notice.');deny(!r.beta.locked||r.members.some(m=>m.browser===session.digest),403,'ROOM_ACCESS_REQUIRED','New joins are closed.');}
  if(action==='host-login'){if(beta)beta.rate(req,'login-attempt',30,60);const result=state.mutateRoom(id,current=>authenticateHost(current,session,data.password,state.now()));deny(!result.limited,429,'HOST_LOGIN_LIMIT','試行が多いため5分待ってください。');deny(result.ok,403,'HOST_LOGIN_FAILED','主催者パスワードを確認してください。');renewSession(req,res,session,r.created+7200000);json(res,200,present(state.loadRoom(id),session,'host'));return true;}
  if(beta&&action==='join')beta.rate(req,action,30,null,60000,session.digest);
  if(action==='search'){
   const m=actor(r,session),version=baselineHash(m);deny(m.private.baseline&&!m.published&&!m.late&&['prepare','listen'].includes(r.stage),409,'INITIAL_REQUIRED','最初の一言を置いてから作品を探せます。');deny(data.externalConsent===true,400,'EXTERNAL_CONSENT','作品名だけをQlooに送る確認が必要です。');
   const query=validateQuery({operation:'search',kind:data.kind,text:data.text,take:5});if(beta)beta.rate(req,'search',12,120,60000,session.digest);
   const search=async()=>{const check=()=>{const fresh=state.loadRoom(id),who=actor(fresh,session);deny(state.session(cookieValue(req))?.digest===session.digest&&baselineHash(who)===version&&!who.published&&!who.late&&['prepare','listen'].includes(fresh.stage),409,'INPUT_CHANGED','入力や進行が変わりました。');return fresh;};const fresh=check();if(authorizeRoom)authorizeRoom(fresh);const last=state.db.prepare('SELECT MAX(start) AS n FROM attempts').get().n;if(last)await delay(Math.max(0,state.policy().intervalMs-(state.now()-last)));const current=check();return guard.execute(id,snapshotHash(current),query);};
   const result=await(r.flow==='cards'?network(search,id+':'+session.digest):guard.execute(id,snapshotHash(r),query));
   const found=result.entities.filter(e=>e.kind===query.kind).map(e=>({id:'qloo-'+e.id,entityId:e.id,title:e.title,kind:e.kind,detail:e.detail||''}));
   state.mutateRoom(id,current=>{const who=actor(current,session);deny(state.session(cookieValue(req))?.digest===session.digest&&baselineHash(who)===version&&!who.published&&['prepare','listen'].includes(current.stage),409,'INPUT_CHANGED','入力や進行が変わったため、検索結果を反映しませんでした。');const old=new Map((current.lookups[who.id]||[]).map(x=>[x.id,x]));for(const item of found)old.set(item.id,item);current.lookups[who.id]=[...old.values()].slice(-100);});json(res,200,{entities:found});return true;
  }
  if(action==='materials'){
   const m=actor(r,session);deny(m.private.baseline&&!m.published&&!m.late&&['prepare','listen'].includes(r.stage),409,'INITIAL_REQUIRED','最初の一言を置いてから、手がかりを見られます。');deny(data.version===m.version,409,'DRAFT_CHANGED','入力が変わりました。確認してください。');
   const version=baselineHash(m),key=id+':'+m.id+':'+version;
   if(!flights.has(key)){
    const run=(async()=>{
     const previous=m.private.material;if(previous&&['complete','partial'].includes(previous.state))return;
     let result=r.flow==='cards'?null:recordedMaterials(m.private.baseline.works);
     if(!result){if(materials&&m.private.externalConsent&&m.private.baseline.works.some(w=>w.entityId)){if(beta)beta.rate(req,'materials',12,120,60000,session.digest);const obtain=async()=>{const fresh=state.loadRoom(id),who=actor(fresh,session);deny(baselineHash(who)===version,409,'INPUT_CHANGED','入力が変わりました。');if(r.flow==='cards'&&authorizeRoom)authorizeRoom(fresh);return materials.obtain(fresh,who,{signalSession:()=>state.session(cookieValue(req))?.digest===session.digest});};result=await(r.flow==='cards'?network(obtain,id+':'+session.digest):obtain());}else result={state:'unavailable',tags:[],candidates:[],note:'今回は手がかりを使わず、あなたの言葉で進められます。'};}
     state.mutateRoom(id,current=>{const who=actor(current,session);deny(state.session(cookieValue(req))?.digest===session.digest&&baselineHash(who)===version&&!who.published&&['prepare','listen'].includes(current.stage),409,'INPUT_CHANGED','入力や進行が変わったため、手がかりを反映しませんでした。');who.private.material=result;current.revision++;});
    })();flights.set(key,run);run.finally(()=>flights.delete(key)).catch(()=>{});
   }
   await flights.get(key);const current=state.loadRoom(id);json(res,200,present(current,session,'participant'));return true;
  }
  state.mutateRoom(id,current=>{if(beta){beta.requireAccess(current,session);deny(state.session(cookieValue(req))?.digest===session.digest,401,'SESSION_REQUIRED','Session expired.');if(action==='join'){deny(!current.beta.locked||current.members.some(m=>m.browser===session.digest),403,'ROOM_ACCESS_REQUIRED','New joins are closed.');deny(data.policyVersion===current.beta.policyVersion,400,'POLICY_REQUIRED','Review the current policy.');}}mutatePerspective(current,session,action,data,state.now());if(action==='withdraw'&&current.flow!=='cards')guard.revoke(id);if(beta&&action==='join'){const member=current.members.find(m=>m.browser===session.digest);member.policyVersion=current.beta.policyVersion;member.joinedAt=state.now();}});
  if(beta&&action==='stage'&&state.loadRoom(id).stage==='takeaway')beta.rotate(id,session,true);
  const current=state.loadRoom(id);if(action==='join')renewSession(req,res,session,current.created+7200000);if(beta&&action==='host-logout'){json(res,200,{loggedOut:true});return true;}json(res,action==='join'?201:200,present(current,session,action==='host-logout'?'display':view));return true;
 };
}
