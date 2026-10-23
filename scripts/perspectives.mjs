import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {deny,hash} from './security-core.mjs';
import {featureLabels} from '../web/qloo-feature-labels.js';
import {featureLabels as featureLabelsEn} from '../web/qloo-feature-labels.en.js';
import {records as recorded} from '../web/insights-records.js';
export const familiarity={first:{label:'はじめまして',prompt:'今日の自分を紹介できる「好き」をひとつ。',ask:'どんなところが好きか、本人に聞いてみる。'},known:{label:'顔見知り',prompt:'まだ話したことのない「好き」をひとつ。',ask:'初めて知ったところを、本人に確かめる。'},team:{label:'いつものチーム',prompt:'最近の自分に残っている「好き」をひとつ。',ask:'今の好きについて、いつもの印象から少し離れて聞く。'}};
export const stages={prepare:'自分の言葉を置く',listen:'聞き合う',reflect:'自分に残す',takeaway:'本編へ持っていく'};
const trim=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const uid=()=>randomBytes(12).toString('hex');
const styleWords={...featureLabels,'surrealism':'シュルレアリスム','Narratively Inventive':'独創的な語り','Inventive':'独創的','Reflective':'内省的な表現','Atmospheric':'空気感のある表現','Stylized':'様式的','Whimsical':'遊び心のある表現','Poetic':'詩的な表現','Minimalist':'そぎ落とした表現','Experimental':'実験的','Intimate':'親密な表現','Acoustic':'アコースティック'};
const culturalFeatures=new Set(['Baroque Pop','Piano','Guitar','Acoustic','Jazz','Rock','Indie Rock','Indie Pop','Alternative Rock','Classical','Electronic','Ambient','Folk','Pop','Soul','Blues','Instrumental','Experimental','Minimalist','Surrealism','surrealism','Drama','Comedy','Animation','Documentary','Science Fiction','Fantasy','Mystery','Romance','Poetic','Atmospheric','Reflective','Narratively Inventive']);
const entityFeatures=e=>(Array.isArray(e.tags)?e.tags:[]).filter(t=>typeof t?.name==='string'&&(typeof t.tag_id==='string'&&t.tag_id.startsWith('urn:tag:style:qloo')||culturalFeatures.has(t.name))).slice(0,5).map(t=>({...((typeof t.tag_id==='string'&&t.tag_id.length<=300)?{id:t.tag_id}:{}),label:styleWords[t.name]||trim(t.name,100),original:trim(t.name,100)}));
export const library=[...new Map(recorded.profiles.flatMap(p=>p.works.map(([entityId,title,kind])=>[entityId,{id:'qloo-'+entityId,entityId,title,kind}]))).values()];
export const sampleProfiles=recorded.profiles.map(p=>({key:p.key,name:p.name.replace('検証・',''),works:p.works.map(([entityId])=>library.find(w=>w.entityId===entityId))}));
export function materialProjection(rows,works,{cards=false}={}){
 const names=new Map(works.map(w=>[w.entityId.toLowerCase(),w.title]));
 const tags=[],candidates=[];
 for(const row of rows){const proof={source:'Qloo',attemptId:row.attemptId,requestHash:row.requestHash,receivedAt:row.receivedAt};
  for(const t of row.data?.results?.tags||[]){if((cards?/^urn:tag:style:qloo(?::|$)/.test(t.tag_id||''):Object.hasOwn(styleWords,t.name))&&t.tag_id&&!tags.some(x=>x.id===t.tag_id))tags.push({id:t.tag_id,label:styleWords[t.name]||trim(t.name,100),original:t.name,proof});}
  for(const e of row.data?.results?.entities||[]){if(candidates.some(c=>c.id===e.entity_id.toLowerCase()))continue;candidates.push({id:e.entity_id.toLowerCase(),title:e.name,kind:typeof e.subtype==='string'?e.subtype.slice(11):row.query?.kind,description:trim(e.properties?.description,1600),contributions:(Array.isArray(e.query?.explainability?.['signal.interests.entities'])?e.query.explainability['signal.interests.entities']:[]).filter(x=>typeof x?.entity_id==='string'&&Number.isFinite(x.score)&&x.score>=0&&x.score<=1&&names.has(x.entity_id.toLowerCase())).map(x=>({title:names.get(x.entity_id.toLowerCase()),score:x.score})),warning:trim(e.query?.explainability?.warning,200),...(cards?{sources:row.query?.entities?.map(id=>names.get(id.toLowerCase())).filter(Boolean)||works.map(w=>w.title),features:entityFeatures(e)}:{}),proof});}
 }
 const groups=[...new Set(candidates.map(c=>c.kind))].map(k=>candidates.filter(c=>c.kind===k)),mixed=[];for(let i=0;i<3;i++)for(const group of groups)if(group[i])mixed.push(group[i]);
 return {tags:tags.slice(0,cards?5:3),candidates:mixed.slice(0,6),allCandidateCount:candidates.length};
}
export function recordedMaterials(works){const ids=works.map(w=>w.entityId?.toLowerCase()).sort();const profile=sampleProfiles.find(p=>JSON.stringify(p.works.map(w=>w.entityId).sort())===JSON.stringify(ids));if(!profile)return null;const rows=recorded.records.filter(r=>r.query.profile===profile.key);return {...materialProjection(rows,works),state:'complete',recorded:true,note:'2026年10月16日に、この作品の組合せから実取得した記録です。語は表示用に選別しています。新しいAPI通信はありません。'};}
function roomRequired(r){deny(r?.experience==='perspectives',404,'ROOM_MISSING','この場が見つかりません。');}
function author(r,session){roomRequired(r);const m=session?.digest?r.members.find(m=>!m.synthetic&&typeof m.browser==='string'&&m.browser===session.digest):null;deny(m,403,'MEMBER_REQUIRED','参加したブラウザから開いてください。');return m;}
export const hasHostAccess=(r,session)=>!!session?.digest&&(r.flow==='cards'?(r.hostSessions||[]).includes(session.digest):r.browserOwner===session.digest);
export function owner(r,session){roomRequired(r);deny(hasHostAccess(r,session),403,'HOST_REQUIRED','主催者のブラウザから開いてください。');}
export function cardElements(value){
 deny(Array.isArray(value)&&value.length>=1&&value.length<=10,400,'ELEMENTS_INVALID','要素は1〜10個入力してください。');
 const clean=value.map(v=>{deny(typeof v==='string'&&!/[\u0000-\u001f\u007f]/u.test(v),400,'ELEMENTS_INVALID','要素を短い言葉で入力してください。');const t=v.trim();deny(t.length>=1&&[...t].length<=36,400,'ELEMENTS_INVALID','要素は1個36文字以内にしてください。');return t;});
 deny(new Set(clean.map(v=>v.normalize('NFKC').toLocaleLowerCase())).size===clean.length,400,'ELEMENTS_DUPLICATE','同じ要素はひとつにまとめてください。');return clean;
}
function passwordDigest(value,salt){return scryptSync(value,salt,32).toString('hex');}
export function authenticateHost(r,session,password,now=Date.now()){
 roomRequired(r);deny(r.flow==='cards'&&session?.digest,403,'HOST_REQUIRED','主催者としてログインしてください。');
 const failures=Array.isArray(r.hostFailures)?{}:(r.hostFailures||{}),key=hash(session.digest);for(const k of Object.keys(failures)){failures[k]=failures[k].filter(t=>t>now-300000);if(!failures[k].length)delete failures[k];}r.hostFailures=failures;const attempts=failures[key]||[];
 if(attempts.length>=5||Object.values(failures).reduce((n,x)=>n+x.length,0)>=200||!failures[key]&&Object.keys(failures).length>=100)return {ok:false,limited:true};
 const valid=typeof password==='string'&&password.length>=10&&password.length<=128;
 const digest=passwordDigest(valid?password:'invalid-password',r.hostAuth.salt);
 const ok=valid&&timingSafeEqual(Buffer.from(digest,'hex'),Buffer.from(r.hostAuth.hash,'hex'));
 if(!ok){deny(Object.keys(failures).length<100||failures[key],429,'HOST_LOGIN_LIMIT','Please wait before trying again.');failures[key]=[...attempts,now];return {ok:false,limited:false};}
 r.hostSessions=[...new Set([...(r.hostSessions||[]).filter(s=>s!==session.digest),session.digest])].slice(-8);return {ok:true};
}
function checkVersion(m,data){deny(Number.isInteger(data.version)&&data.version===m.version,409,'DRAFT_CHANGED','別のタブで内容が変わりました。最新の内容を確認してください。');}
function baselineWorks(r,m,data){
 const supplied=Array.isArray(data.works)?data.works:[];deny(supplied.length>=1&&supplied.length<=2,400,'WORK_REQUIRED','今日話せる好きは、ひとつから選べます。');
 return supplied.map(w=>{deny(w&&typeof w==='object'&&!Array.isArray(w),400,'WORK_REQUIRED','好きの内容を確認してください。');const formal=[...(r.flow==='cards'?[]:library),...(r.lookups?.[m.id]||[])].find(x=>x.id===w.id);if(formal)return structuredClone(formal);deny(!String(w.id||'').startsWith('qloo-'),400,'WORK_UNVERIFIED','検索した作品を選び直してください。');const title=trim(w.title,100);deny(title,400,'WORK_REQUIRED','好きなものをひとつ書いてください。');return {id:'free-'+uid(),title,kind:r.flow==='cards'&&['movie','artist','book'].includes(w.kind)?w.kind:'other'};});
}
export function refreshSignals(r){if(r.flow==='cards'){r.snapshot=[];return;}r.snapshot=r.members.filter(m=>m.private?.baseline&&m.private.externalConsent).map(m=>({id:m.id,items:m.private.baseline.works.filter(w=>w.entityId).map(w=>({id:w.id,externalConsent:true}))}));}
export function createPerspective(state,session,data){
 const cards=data.flow==='cards';if(cards)deny(typeof data.hostPassword==='string'&&data.hostPassword.length>=10&&data.hostPassword.length<=128,400,'HOST_PASSWORD_INVALID','主催者パスワードを10〜128文字で設定してください。');
 const id=randomBytes(3).toString('hex').toUpperCase();deny(!state.db.prepare('SELECT id FROM rooms WHERE id=?').get(id),409,'ROOM_COLLISION','もう一度場をつくってください。');
 const size=Number(data.size)||4;deny([3,4,5,6].includes(size),400,'SIZE_INVALID','3〜6人で準備できます。');
 const miro=trim(data.miro,500);if(miro){let u;try{u=new URL(miro);}catch{}deny(u?.protocol==='https:'&&(u.hostname==='miro.com'||u.hostname.endsWith('.miro.com'))&&!u.username&&!u.password,400,'MIRO_INVALID','Miroのhttps URLを確認してください。');}
 const r={id,experience:'perspectives',browserOwner:session.digest,hostToken:uid(),created:state.now(),phase:'collecting',stage:'prepare',phaseAt:state.now(),revision:0,title:trim(data.title,80)||'好きの見方を持ち寄る',mode:familiarity[data.mode]?data.mode:'first',size,minutes:[10,12,15].includes(Number(data.minutes))?Number(data.minutes):size<=4?10:12,miro,sample:!cards&&data.sample===true,members:[],snapshot:[],turn:null,visited:[],history:[],lookups:{}};
 if(cards){const salt=randomBytes(16).toString('hex');r.flow='cards';r.hostAuth={salt,hash:passwordDigest(data.hostPassword,salt)};r.hostSessions=[session.digest];r.hostFailures={};}
 if(r.sample){r.size=3;r.title='好きの見方を持ち寄る・実データで体験';for(const key of ['A','C']){const p=sampleProfiles.find(p=>p.key===key),word=key==='A'?'旅先で、知らない人と話す空気が好き。':'夜に聴く、落ち着いた音楽が好き。';r.members.push({id:'sample-'+key,name:p.name,synthetic:true,status:'shared',version:1,volunteer:true,published:{work:key==='A'?p.works[1]:p.works[0],wording:word,references:[],candidate:null},private:{baseline:{works:p.works,initial:word},wording:word,material:null,externalConsent:false,reflection:{self:'',other:'',shared:''}}});}}
 state.saveRoom(r);return r;
}
export function mutatePerspective(r,session,action,data,now=Date.now()){
 roomRequired(r);
 if(r.flow==='cards')deny(!['ask','confirm','reflection','volunteer','wording'].includes(action),404,'ACTION_MISSING','この操作は使えません。');
 if(action==='host-logout'){owner(r,session);deny(r.flow==='cards',404,'ACTION_MISSING','この操作は使えません。');r.hostSessions=r.hostSessions.filter(s=>s!==session.digest);r.revision++;return;}
 if(action==='join'){
  const old=r.members.find(m=>m.browser===session.digest);if(old)return;
  const name=trim(data.name,24);deny(name,400,'NAME_REQUIRED','呼んでほしい名前を書いてください。');deny(r.members.length<r.size,409,'ROOM_FULL','この場は定員になりました。');
  const sample=r.sample?sampleProfiles.find(p=>p.key==='B'):null;
  r.members.push({id:uid(),browser:session.digest,name,synthetic:false,late:r.flow==='cards'?r.stage==='takeaway':r.stage!=='prepare',status:(r.stage==='prepare'||r.flow==='cards'&&r.stage==='listen')?'editing':'observer',version:0,volunteer:false,published:null,private:{baseline:null,wording:'',material:null,externalConsent:false,reflection:{self:'',other:'',shared:''},sampleWorks:sample?.works||null}});r.revision++;return;
 }
 if(action==='stage'){
  owner(r,session);deny(data.expectedStage===r.stage,409,'STAGE_CHANGED','進行が変わりました。最新の画面を確認してください。');
  const next=(r.flow==='cards'?{prepare:'listen',listen:'takeaway'}:{prepare:'listen',listen:'reflect',reflect:'takeaway'})[r.stage];deny(next&&r.members.length,409,'STAGE_INVALID','参加者を待ってから進められます。');if(r.turn){r.history.push(r.turn);r.history=r.history.slice(-30);}r.stage=next;r.phaseAt=now;r.turn=null;r.revision++;return;
 }
 if(action==='turn'){
  owner(r,session);deny(r.stage==='listen'&&data.previousTurn===(r.turn?.id||''),409,'TURN_CHANGED','紹介する人が変わりました。画面を確認してください。');
  const m=r.members.find(m=>m.id===data.member);deny(m?.published&&(r.flow==='cards'||m.volunteer),400,'SPEAKER_INVALID','紹介してもよい人から選んでください。');if(r.turn)r.history.push(r.turn);r.history=r.history.slice(-30);r.turn={id:uid(),speaker:m.id,started:now,questions:[],confirmations:[]};r.visited=[...new Set([...r.visited,m.id])];r.revision++;return;
 }
 const m=author(r,session);
 if(action==='baseline'){
  deny(['prepare','listen'].includes(r.stage)&&!m.late&&!m.published,409,'INPUT_CLOSED','入力の時間が終わりました。今の内容は公開されていません。');checkVersion(m,data);
  const works=baselineWorks(r,m,data),elements=r.flow==='cards'?cardElements(data.elements):null,identity=w=>w.entityId?.toLowerCase()||w.kind+':'+w.title.normalize('NFKC').toLocaleLowerCase(),old=m.private.baseline?.works||[],sameSource=r.flow==='cards'&&old.length===works.length&&old.every((w,i)=>identity(w)===identity(works[i]));m.private.baseline={works,initial:r.flow==='cards'?'':trim(data.initial,240),...(elements?{elements}:{}),committedAt:now};m.private.wording=r.flow==='cards'?'':trim(data.initial,240);m.private.externalConsent=data.externalConsent===true||sameSource&&m.private.externalConsent===true;if(!sameSource){m.private.material=null;m.private.cardDraft=null;}m.status='preparing';m.version++;refreshSignals(r);
 }else if(action==='wording'){
  deny(m.private.baseline&&!m.published&&['prepare','listen'].includes(r.stage),409,'NOT_PREPARING','先に最初の一言を置いてください。');checkVersion(m,data);m.private.wording=trim(data.wording,240);m.version++;
 }else if(action==='publish'){
  deny(m.private.baseline&&!m.published&&['prepare','listen'].includes(r.stage)&&m.status!=='observer',409,'SHARE_CLOSED','この時間には公開できません。');checkVersion(m,data);deny(r.flow==='cards'||data.consent===true,400,'SHARE_CONFIRM','公開する内容を確認してください。');
  if(r.flow==='cards')deny(data.references===undefined||Array.isArray(data.references),400,'REFERENCE_INVALID','表示された手がかりから選んでください。');
  const material=m.private.material,refs=Array.isArray(data.references)?data.references:[];deny(refs.length<=(r.flow==='cards'?5:2)&&new Set(refs).size===refs.length&&refs.every(id=>material?.tags?.some(t=>t.id===id)),400,'REFERENCE_INVALID','表示された手がかりから選んでください。');
  const candidate=data.candidate?material?.candidates?.find(c=>c.id===data.candidate):null;deny(!data.candidate||candidate,400,'REFERENCE_INVALID','表示された候補から選んでください。');
  if(r.flow==='cards'){
   const elements=cardElements(data.elements),ids=data.candidateIds===undefined?[]:data.candidateIds;
   deny(Array.isArray(ids)&&ids.length<=6&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&material?.candidates?.some(c=>c.id===id)),400,'REFERENCE_INVALID','表示された関連作品から選んでください。');
   const added=data.referenceAdded;deny(added===undefined||added&&typeof added==='object'&&!Array.isArray(added)&&Object.keys(added).length<=5&&Object.keys(added).every(id=>refs.includes(id)&&typeof added[id]==='boolean'),400,'REFERENCE_INVALID','Check selected references.');const words=data.referenceWords;deny(words===undefined||words&&typeof words==='object'&&!Array.isArray(words)&&Object.keys(words).length<=5&&Object.keys(words).every(id=>refs.includes(id)),400,'REFERENCE_INVALID','表示された手がかりから選んでください。');const references=refs.map(id=>{const tag=structuredClone(material.tags.find(t=>t.id===id)),word=words?.[id]??(elements.includes(tag.label)?tag.label:null);deny(words===undefined||typeof word==='string'&&elements.includes(word)&&[tag.label,tag.original,featureLabels[tag.original],featureLabelsEn[tag.original]].some(alias=>typeof alias==='string'&&alias.normalize('NFKC').toLocaleLowerCase()===word.normalize('NFKC').toLocaleLowerCase()),400,'REFERENCE_INVALID','表示された手がかりから選んでください。');return {...tag,added:added?.[id]===true,...(word?{word}:{})};});
   const candidates=ids.map(id=>structuredClone(material.candidates.find(c=>c.id===id)));
   m.published={work:structuredClone(m.private.baseline.works[0]),works:structuredClone(m.private.baseline.works),elements,wording:elements.join(' / '),references,candidates,candidate:candidates[0]||null};m.private.cardDraft=null;m.volunteer=true;m.status='shared';m.version++;r.revision++;return;
  }
  const wording=trim(data.wording,240);m.private.wording=wording;m.published={work:structuredClone(m.private.baseline.works[0]),wording,references:refs.map(id=>{const t=material.tags.find(t=>t.id===id);return {id:t.id,label:t.label,original:t.original,proof:t.proof};}),candidate:candidate?{id:candidate.id,title:candidate.title,kind:candidate.kind,proof:candidate.proof}:null};m.volunteer=data.volunteer===true;m.status='shared';m.version++;
 }else if(action==='listener'){
  deny(['prepare','listen'].includes(r.stage),409,'INPUT_CLOSED','今の時間には変更できません。');checkVersion(m,data);deny(!m.published,409,'WITHDRAW_REQUIRED','公開した内容は、取り下げから外せます。');m.status='listener';m.volunteer=false;m.version++;
 }else if(action==='resume'){
  deny(['prepare','listen'].includes(r.stage)&&!m.late&&m.status==='listener',409,'INPUT_CLOSED','今の時間には入力へ戻れません。');m.status=m.private.baseline?'preparing':'editing';m.version++;
 }else if(action==='volunteer'){
  deny(m.published&&['prepare','listen'].includes(r.stage),409,'SHARE_REQUIRED','共有したあとに紹介への参加を選べます。');m.volunteer=data.value===true;if(!m.volunteer&&r.turn?.speaker===m.id){r.history.push(r.turn);r.history=r.history.slice(-30);r.turn=null;}m.version++;
 }else if(action==='ask'){
  deny(r.stage==='listen'&&r.turn?.id===data.turn&&r.turn.speaker!==m.id,409,'TURN_CHANGED','紹介する人が変わりました。質問を確認してください。');const question=trim(data.question,200);deny(question,400,'QUESTION_REQUIRED','本人に聞きたいことをひとつ書いてください。');const old=r.turn.questions.find(q=>q.author===m.id);deny(!old||!r.turn.confirmations.some(c=>c.question===old.id),409,'QUESTION_CONFIRMED','確認済みの質問は変えられません。');const kind=data.kind==='question'?'question':'understanding';if(old){old.text=question;old.kind=kind;}else r.turn.questions.push({id:uid(),author:m.id,text:question,kind});
 }else if(action==='confirm'){
  deny(r.stage==='listen'&&r.turn?.id===data.turn&&r.turn.speaker===m.id,403,'SPEAKER_REQUIRED','いま紹介している本人だけが確かめられます。');deny(r.turn.questions.some(q=>q.id===data.question)&&['close','add','pass'].includes(data.value),400,'CONFIRM_INVALID','確認する問いを選んでください。');r.turn.confirmations=r.turn.confirmations.filter(c=>c.question!==data.question);r.turn.confirmations.push({question:data.question,value:data.value,text:data.value==='add'?trim(data.text,240):''});
 }else if(action==='reflection'){
  deny(['reflect','takeaway'].includes(r.stage),409,'REFLECTION_CLOSED','振り返りの時間に残せます。');checkVersion(m,data);m.private.reflection={self:trim(data.self,500),other:trim(data.other,500),shared:data.share===true?trim(data.shared,160):''};m.version++;
 }else if(action==='withdraw'){
  if(r.flow==='cards')m.private.cardDraft=m.published?structuredClone(m.published):m.private.cardDraft;m.published=null;m.volunteer=false;if(r.flow!=='cards'){m.private.material=null;m.private.externalConsent=false;}m.private.reflection.shared='';m.status='listener';m.version++;if(r.turn?.speaker===m.id)r.turn=null;
  for(const t of [r.turn,...r.history].filter(Boolean)){t.questions=t.questions.filter(q=>q.author!==m.id);t.confirmations=t.confirmations.filter(c=>t.questions.some(q=>q.id===c.question));}r.history=r.history.filter(t=>t.speaker!==m.id);refreshSignals(r);
 }else deny(false,404,'ACTION_MISSING','この操作は使えません。');
 r.revision++;
}
export function publicSupplements(r,id){return [...new Set([...r.history,r.turn].filter(t=>t?.speaker===id).flatMap(t=>t.confirmations.filter(c=>c.value==='add'&&c.text).map(c=>c.text)))];}
export function perspectiveView(r,session,view='display',safety=null){
 roomRequired(r);const host=view==='host';if(host)owner(r,session);const actor=view==='participant'&&session?.digest?r.members.find(m=>!m.synthetic&&typeof m.browser==='string'&&m.browser===session.digest):null;
 const publicMembers=r.members.map(m=>({id:m.id,name:m.name,synthetic:m.synthetic===true,status:m.status,volunteer:m.volunteer,published:m.published?structuredClone(m.published):null,sharedReflection:m.private.reflection?.shared||'',supplements:publicSupplements(r,m.id),visited:r.visited.includes(m.id)}));
 return {id:r.id,...(r.flow==='cards'?{flow:'cards'}:{}),experience:r.experience,title:r.title,mode:r.mode,size:r.size,minutes:r.minutes,miro:r.miro,sample:r.sample,stage:r.stage,phaseAt:r.phaseAt,expiresAt:r.created+7200000,revision:r.revision,role:host?'host':actor?'participant':'viewer',members:publicMembers,turn:structuredClone(r.turn),history:structuredClone(r.history),me:actor?{id:actor.id,name:actor.name,status:actor.status,late:actor.late===true,version:actor.version,volunteer:actor.volunteer,published:structuredClone(actor.published),baseline:structuredClone(actor.private.baseline),cardDraft:structuredClone(actor.private.cardDraft||null),wording:actor.private.wording,material:structuredClone(actor.private.material),reflection:structuredClone(actor.private.reflection),sampleWorks:structuredClone(actor.private.sampleWorks),externalConsent:actor.private.externalConsent}:null,...(host?{safety}:{}),...(hasHostAccess(r,session)?{canFacilitate:true}:{}),...(actor?{materialAvailable:!!safety?.enabled&&!!(safety?.allowed||safety?.autoAuthorize)&&!!safety?.connected,searchAvailable:!!safety?.enabled&&!!(safety?.allowed||safety?.autoAuthorize)&&!!safety?.searchConnected}:{}),...(!host&&view==='participant'&&!actor?{canJoin:r.members.length<r.size}:{} )};
}
export const baselineHash=m=>hash(JSON.stringify({version:m.version,baseline:m.private.baseline,consent:m.private.externalConsent}));
const xml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function perspectiveExport(r,names=false){
 const lines=[];const add=(text,small=false)=>{const chars=[...String(text)];for(let i=0;i<chars.length;i+=small?54:38)lines.push({text:chars.slice(i,i+(small?54:38)).join(''),small});};
 add(r.title);add('好きの見方を持ち寄る / 共有すると選んだ言葉だけ',true);if(r.sample)add('架空の参加者・発言と、過去のQloo実データを使った体験',true);
 for(const [index,m] of r.members.filter(m=>m.published).entries()){add((names?m.name:'参加者'+(index+1))+(m.synthetic?'（架空）':'')+'：'+m.published.work.title);if(m.published.wording)add(m.published.wording);if(m.published.references.length)add('本人が選んだ手がかり：'+m.published.references.map(t=>t.label).join(' / '),true);if(m.published.candidate)add('本人が残したQloo候補：'+m.published.candidate.title,true);for(const text of publicSupplements(r,m.id))add('話して付け足したこと：'+text,true);if(m.private.reflection.shared)add('最後に共有した一言：'+m.private.reflection.shared,true);lines.push({text:'',small:true});}
 for(const m of r.members.filter(m=>!m.published&&m.private.reflection.shared)){add(names?m.name:'聞き手の参加者');add('最後に共有した一言：'+m.private.reflection.shared);}
 const height=160+lines.length*40;return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}"><rect width="1080" height="${height}" fill="#faf9f6"/><g fill="#282330" font-family="sans-serif">${lines.map((l,i)=>`<text x="64" y="${80+i*40}" font-size="${l.small?18:25}">${xml(l.text)}</text>`).join('')}</g><text x="64" y="${height-32}" font-family="sans-serif" font-size="16" fill="#625969">Common Ground · 下書き・非公開の振り返りは含みません</text></svg>`;
}
