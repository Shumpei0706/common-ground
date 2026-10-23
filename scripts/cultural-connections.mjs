import { OFFICIAL_ORIGIN } from './qloo-installation.mjs';
export const kindNames={movie:'映画',artist:'音楽',book:'本'};
export const discoveryKinds=Object.keys(kindNames);
const kindOf=item=>discoveryKinds.find(k=>item.kind===k||item.kind===kindNames[k])||null;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function analysisPlan(room,kind='movie',entityMap={}){
 const origins=[];
 for(const person of room.snapshot){
  const eligible=person.items.filter(i=>i.externalConsent===true&&uuid.test(i.entityId||entityMap[i.id]||''));
  const item=eligible.find(i=>i.intro)||eligible[0];if(!item)continue;
  const entityId=(item.entityId||entityMap[item.id]).toLowerCase();
  let origin=origins.find(o=>o.entityId===entityId);
  if(!origin){origin={entityId,kind,sourceKind:kindOf(item),endpoints:[]};origins.push(origin);}
  origin.endpoints.push({member:person.id,item:item.id,title:item.title});
 }
 return origins.slice(0,6);
}
// A finite plan over the ORIGINAL confirmed likes. Suggestions never become signals.
export function crossDomainPlan(room,entityMap={}){
 const origins=analysisPlan(room,'movie',entityMap),plan=[];
 for(let pass=0;pass<3;pass++)for(const origin of origins){
  const kinds=[...discoveryKinds.filter(k=>k!==origin.sourceKind),...discoveryKinds.filter(k=>k===origin.sourceKind)];
  plan.push({...origin,kind:kinds[pass]});
 }
 return plan;
}
function validOrigins(room,record){return (record.endpoints||[]).filter(ep=>room.snapshot.some(p=>p.id===ep.member&&p.items.some(i=>i.id===ep.item&&i.externalConsent===true&&i.entityId?.toLowerCase()===record.entityId)));}
function evidenceFor(room,record,endpoints,rank){const item=room.snapshot.flatMap(p=>p.items).find(i=>i.entityId?.toLowerCase()===record.entityId);return {entityId:record.entityId,requestHash:record.requestHash,attemptId:record.attemptId,receivedAt:record.receivedAt,endpoint:OFFICIAL_ORIGIN,sourceKind:record.sourceKind||kindOf(item||{}),outputKind:record.kind,rank,origins:endpoints};}
function rawConnections(room){
 const byId=new Map(),links=new Map(),selected=room.snapshot.flatMap(p=>p.items.filter(i=>i.entityId).map(i=>({member:p.id,item:i.id,title:i.title,entityId:i.entityId.toLowerCase()})));
 for(const record of room.analysisRecords||[]){
  // Only single-original-entity records can support an independent path.
  if(!uuid.test(record.entityId||'')||record.synthetic&&room.replay?.kind!=='synthetic')continue;
  const endpoints=validOrigins(room,record);if(!endpoints.length)continue;
  for(const [index,entity] of record.entities.entries()){
   if(!uuid.test(entity.id||'')||entity.kind!==record.kind||entity.id===record.entityId)continue;
   const evidence=evidenceFor(room,record,endpoints,index+1),destinations=selected.filter(x=>x.entityId===entity.id);
   if(destinations.length){
    for(const to of destinations){const from=endpoints.filter(ep=>ep.member!==to.member);if(!from.length)continue;
     const id=`qloo-link-${record.entityId}-${to.member}-${to.item}`;
     if(!links.has(id))links.set(id,{id,synthetic:record.synthetic===true,entityId:entity.id,from,to,evidence:{...evidence,origins:from},source:record.synthetic?'架空の操作検証（Qloo実結果ではありません）':'Qloo Taste AI · '+OFFICIAL_ORIGIN,provenance:'起点の作品からの照会結果が、別の参加者の持ち寄った好きに一致しました。逆向きの推薦を意味しません。'});
    }continue;
   }
   let c=byId.get(entity.id);
   if(!c){c={id:'qloo-'+entity.id,title:entity.title,detail:entity.detail||kindNames[record.kind],outputKind:record.kind,endpoints:[],evidence:[],source:'Qloo Taste AI · '+OFFICIAL_ORIGIN};byId.set(entity.id,c);}
   // Different request parameters for one origin are not independent origins.
   if(c.evidence.some(e=>e.entityId===record.entityId))continue;
   c.evidence.push(evidence);
   for(const ep of endpoints)if(!c.endpoints.some(e=>e.member===ep.member&&e.item===ep.item))c.endpoints.push(ep);
  }
 }
 return {candidates:[...byId.values()].map(c=>{
  const people=new Set(c.endpoints.map(ep=>ep.member)).size,shared=people>=2&&c.evidence.length>=2;
  return {...c,category:shared?'shared':'detour',label:shared?'複数人の好きから見つかった候補':people>1?'ひとつの元作品からの寄り道':'ひとりの好きからの寄り道',people,sourceKinds:[...new Set(c.evidence.map(e=>e.sourceKind).filter(Boolean))],crossDomain:c.evidence.some(e=>e.sourceKind&&e.sourceKind!==e.outputKind),provenance:shared?`${c.evidence.length}つの異なる元作品の独立した照会に、この候補が含まれました。本人の好きの一致を意味しません。`:'元作品から広がった候補です。複数人の接点を裏付ける独立した根拠はまだありません。'};
 }),links:[...links.values()]};
}
export function connections(room){
 // Keep every grounded candidate available for reaction cancellation. Visibility
 // and ranking must never invalidate a reaction or turn it into a different ID.
 return rawConnections(room).candidates.sort((a,b)=>Number(b.category==='shared')-Number(a.category==='shared')||b.people-a.people||b.evidence.length-a.evidence.length||Number(b.crossDomain)-Number(a.crossDomain)||Math.min(...a.evidence.map(e=>e.rank))-Math.min(...b.evidence.map(e=>e.rank))||a.id.localeCompare(b.id));
}
export function existingConnections(room){return rawConnections(room).links;}
