import { randomBytes } from 'node:crypto';
import { connections, existingConnections } from './cultural-connections.mjs';
export const catalog = [
 {id:'her',title:'her／世界でひとつの彼女',kind:'映画',detail:'2013 · Spike Jonze',mark:'h',tone:'rose'},
 {id:'spirited',title:'千と千尋の神隠し',kind:'映画',detail:'2001 · 宮﨑駿',mark:'千',tone:'sage'},
 {id:'spitz',title:'スピッツ',kind:'音楽',detail:'バンド',mark:'S',tone:'blue'},
 {id:'nujabes',title:'Nujabes',kind:'音楽',detail:'アーティスト',mark:'N',tone:'lilac'},
 {id:'little',title:'星の王子さま',kind:'本',detail:'サン＝テグジュペリ',mark:'星',tone:'sand'},
 {id:'murakami',title:'海辺のカフカ',kind:'本',detail:'村上春樹',mark:'海',tone:'sage'},
 {id:'wes',title:'グランド・ブダペスト・ホテル',kind:'映画',detail:'2014 · Wes Anderson',mark:'G',tone:'rose'},
 {id:'yoga',title:'朝のヨガ',kind:'その他',detail:'自分の時間',mark:'Y',tone:'sand'},
 {id:'coffee',title:'喫茶店めぐり',kind:'その他',detail:'街の小さな発見',mark:'C',tone:'blue'}
];
export const modes={first:{label:'はじめまして',prompt:'今の自分を紹介できる「好き」を。',input:'紹介したい一枚を選ぶ',map:'紹介したい一枚を、みんなの入口に。',mark:'聞いてみたい',reflection:'今日、意外だった接点をひとつ。'},known:{label:'顔見知り',prompt:'普段の役割からは見えにくい「好き」を。',input:'いつもの自分の、少し違う一面',map:'知っている人の、知らなかった一面。',mark:'初めて知った',reflection:'今日、初めて知った一面をひとつ。'},team:{label:'いつものチーム',prompt:'最近の好きも、変わらず好きなものも。',input:'最近／変わらずを、自分で添える',map:'最近の好きから、次のきっかけを。',mark:'聞いてみたい',reflection:'一緒に触れてみたいものをひとつ。'}};
const secret=()=>randomBytes(24).toString('hex');
const text=(x,max=100)=>typeof x==='string'?x.trim().slice(0,max):'';
export class Problem extends Error{constructor(status,message){super(message);this.status=status;}}
const requireThat=(ok,status,message)=>{if(!ok)throw new Problem(status,message);};
export class Workshops{
 constructor(){this.rooms=new Map();}
 create(data){
  for(const [id,r] of this.rooms)if(Date.now()-r.created>7200000)this.rooms.delete(id);
  requireThat(this.rooms.size<100,429,'ルームがいっぱいです。期限切れのルームが整理されるまでお待ちください。');
  let id;do{id=randomBytes(3).toString('hex').toUpperCase();}while(this.rooms.has(id));const hostToken=secret();
  const miro=text(data.miro,500);if(miro)requireThat(/^https:\/\/([a-z0-9-]+\.)?miro\.com\//i.test(miro),400,'Miroの https://miro.com/ で始まるURLを使ってください。');
  const r={id,title:text(data.title,80)||'好きからはじまるワークショップ',mode:modes[data.mode]?data.mode:'first',size:[3,4,5,6].includes(Number(data.size))?Number(data.size):6,minutes:[8,10,12].includes(Number(data.minutes))?Number(data.minutes):10,miro,hostToken,demo:data.demo===true,phase:'collecting',created:Date.now(),phaseAt:Date.now(),revision:0,members:[],snapshot:[],reactions:[],memo:''};
  if(r.demo){r.size=6;const examples=[['結衣',['her','little','coffee']],['蓮',['spitz','nujabes','murakami']],['美咲',['spirited','wes','little']],['拓海',['her','nujabes','coffee']],['直',['spitz','yoga','custom-knit']]];examples.forEach(([name,ids],i)=>r.members.push({id:'demo'+i,token:secret(),name,status:'submitted',items:ids.map((id,k)=>({...catalog.find(c=>c.id===id)||{id,title:'祖母の手編み',kind:'その他',detail:'自分で追加した好き',mark:'編',tone:'sand'},intro:r.mode==='first'&&k===0,recent:r.mode==='team'&&i===0&&k===1?'recent':''})),demo:true,withdrawn:false}));}
  this.rooms.set(id,r);return {id,hostToken};
 }
 room(id){const r=this.rooms.get(id.toUpperCase());requireThat(r&&Date.now()-r.created<7200000,404,'ルームが見つからないか、期限が切れています。主催者に確認してください。');return r;}
 actor(r,token){return token&&r.members.find(m=>m.token===token);}
 host(r,token){requireThat(token===r.hostToken,403,'この操作はファシリテーターだけが行えます。');}
 join(r,data){requireThat(r.members.length<r.size,409,'このルームは定員に達しました。');const name=text(data.name,24);requireThat(name,400,'呼んでほしい名前を入力してください。');const member={id:secret().slice(0,12),token:secret(),name,status:r.phase==='collecting'?'editing':'observer',items:[],demo:false,withdrawn:false};r.members.push(member);r.revision++;return {id:member.id,token:member.token};}
 submit(r,token,data){const m=this.actor(r,token);requireThat(m,403,'参加し直してください。');requireThat(r.phase==='collecting',409,'地図が公開されました。入力は変更できません。');if(data.skip===true){m.items=[];m.status='skipped';r.revision++;return;}
  requireThat(data.consent===true,400,'公開する内容を確認してください。');requireThat(Array.isArray(data.items)&&data.items.length>=2&&data.items.length<=3,400,'好きは2〜3つ選んでください。');
  const items=data.items.map((item,i)=>{requireThat(item&&typeof item==='object'&&!Array.isArray(item),400,'好きの内容を確認してください。');const entry=catalog.find(c=>c.id===item.id)||(r.lookups?.[m.id]||[]).find(c=>c.id===item.id);requireThat(!String(item.id||'').startsWith('qloo-')||entry,400,'検索した作品を選び直してください。');const title=entry?.title||text(item.title,80);requireThat(title,400,'好きのタイトルを入力してください。');return {...entry||{id:'custom-'+m.id+'-'+i,title,kind:'その他',detail:'自分で追加した好き',mark:title.slice(0,1),tone:'sand'},externalConsent:!!entry&&['映画','音楽','本'].includes(entry.kind)&&data.externalConsent===true,intro:r.mode==='first'&&item.intro===true,recent:r.mode==='team'&&['recent','steady'].includes(item.recent)?item.recent:''};});
  requireThat(new Set(items.map(i=>i.title)).size===items.length,400,'同じ好きが重複しています。');requireThat(items.filter(i=>i.intro).length<=1,400,'紹介する一枚はひとつにしてください。');m.items=items;m.status='submitted';m.withdrawn=false;r.revision++;
 }
 withdraw(r,token){const m=this.actor(r,token);requireThat(m,403,'参加し直してください。');if(r.phase!=='collecting'){if(r.lookups)delete r.lookups[m.id];r.analysisRecords=[];r.reactions=r.reactions.filter(x=>!x.target.startsWith('qloo-'));r.apiAnalysis={state:'withdrawn',message:'カードの取り下げにより候補を解除しました。'};}m.items=[];m.status=r.phase==='collecting'?'editing':'withdrawn';m.withdrawn=r.phase!=='collecting';r.snapshot=r.snapshot.map(p=>p.id===m.id?{...p,items:[],status:'withdrawn'}:p);r.reactions=r.reactions.filter(x=>x.actor!==m.id&&!x.target.startsWith(m.id+':'));r.revision++;}
 advance(r,token,data){this.host(r,token);const next={collecting:'map',map:'bridge',bridge:'takeaway'}[r.phase];requireThat(next,409,'このルームは終了しています。');requireThat(data.expectedPhase===r.phase,409,'進行が変わりました。最新の画面を確認してください。');if(r.phase==='collecting'){requireThat(r.members.some(m=>m.status==='submitted'),409,'ひとり以上の提出が必要です。');r.snapshot=r.members.map(m=>({id:m.id,name:m.name,status:m.status,items:structuredClone(m.items),demo:m.demo}));}r.phase=next;r.phaseAt=Date.now();r.revision++;}
 candidates(r){if(!['bridge','takeaway'].includes(r.phase))return [];if(!r.demo)return connections(r);const endpoints=r.snapshot.flatMap(p=>p.items.filter(i=>['her','nujabes'].includes(i.id)).map(i=>({member:p.id,item:i.id})));return endpoints.length>=2?[{id:'bridge-runner',title:'Blade Runner 2049',detail:'2017 · 映画',label:'架空の接点候補',endpoints,source:'操作確認のための架空例です。Qloo APIから取得した結果ではありません。',provenance:'her と Nujabes の入力カードを起点にした表示例。文化的な関連の根拠は検証していません。'}]:[];}
 links(r){return !r.demo&&['bridge','takeaway'].includes(r.phase)?existingConnections(r):[];}
 react(r,token,data){const m=this.actor(r,token);requireThat(m,403,'反応するには参加者として参加してください。');requireThat(r.phase!=='collecting',409,'地図の公開を待ってください。');const {target,value}=data;const isCandidate=this.candidates(r).some(c=>c.id===target);const owner=r.snapshot.find(p=>p.items.some(i=>p.id+':'+i.id===target));requireThat(isCandidate||owner&&owner.id!==m.id,400,'反応できるカードを選んでください。');requireThat(isCandidate?['like','curious','pass','together',''].includes(value):['curious','novel',''].includes(value)&&!(value==='novel'&&r.mode!=='known'),400,'この反応は選べません。');const together=data.kind==='together';if(together)requireThat(isCandidate&&r.mode==='team'&&r.phase==='takeaway'&&['together',''].includes(value),400,'この反応は振り返りで選べます。');else requireThat(value!=='together',400,'反応を確認してください。');r.reactions=r.reactions.filter(x=>!(x.actor===m.id&&x.target===target&&(together?x.value==='together':x.value!=='together')));if(value)r.reactions.push({actor:m.id,target,value});r.revision++;}
 memo(r,token,data){this.host(r,token);requireThat(r.phase==='takeaway',409,'持ち帰り画面でメモを保存してください。');r.memo=text(data.memo,500);r.revision++;}
 view(r,token){const actor=this.actor(r,token),isHost=token===r.hostToken;return {id:r.id,title:r.title,mode:r.mode,size:r.size,minutes:r.minutes,miro:r.miro,demo:r.demo,phase:r.phase,phaseAt:r.phaseAt,created:r.created,revision:r.revision,role:isHost?'host':actor?'participant':'viewer',me:actor?{id:actor.id,name:actor.name,status:actor.status,items:structuredClone(actor.items),withdrawn:actor.withdrawn}:null,members:r.members.map(m=>({id:m.id,name:m.name,status:m.status,demo:m.demo})),map:r.phase==='collecting'?[]:structuredClone(r.snapshot),candidates:this.candidates(r),existingLinks:this.links(r),replay:r.replay||null,reactions:r.phase==='collecting'?[]:Object.values(r.reactions.reduce((a,x)=>{const key=x.target+':'+x.value;a[key]??={target:x.target,value:x.value,count:0};a[key].count++;return a;},{})),myReactions:actor?r.reactions.filter(x=>x.actor===actor.id).map(({target,value})=>({target,value})):[],memo:r.memo,analysis:r.demo?{state:'demo'}:r.apiAnalysis||{state:'idle'}};}
}
