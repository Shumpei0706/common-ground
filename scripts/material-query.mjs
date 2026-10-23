import {deny,hash,GuardError} from './security-core.mjs';
import {OFFICIAL_ORIGIN} from './qloo-endpoint.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function materialRequest(input){
 deny(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(k=>['kind','entities'].includes(k))&&['tag','movie','artist','book'].includes(input.kind)&&Array.isArray(input.entities)&&input.entities.length>=1&&input.entities.length<=2&&input.entities.every(id=>typeof id==='string'&&uuid.test(id)),400,'MATERIAL_QUERY','確認済みの作品だけを照会できます。');
 const kind=input.kind,entities=[...new Set(input.entities.map(x=>x.toLowerCase()))].sort(),take=kind==='tag'?5:3;
 const params={'filter.type':kind==='tag'?'urn:tag':'urn:entity:'+kind,'signal.interests.entities':entities.join(','),take:String(take),...(kind==='tag'?{'filter.tag.types':'urn:tag:style:qloo'}:{'feature.explainability':'true'})};
 const url=new URL('/v2/insights',OFFICIAL_ORIGIN);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);url.searchParams.sort();
 const semantic=kind==='tag'?{operation:'tags',entities,take}:{kind,entities,take};return {query:{kind,entities},params,requestHash:hash(url.toString()),url:url.toString(),semanticQueryHash:hash(JSON.stringify(semantic)),family:Array.from({length:10},(_,i)=>hash(JSON.stringify({...semantic,take:i+1})))};
}
export function materialPlan(works){const entities=works.filter(w=>w.entityId).map(w=>w.entityId);deny(entities.length>=1&&entities.length<=2,400,'MATERIAL_QUERY','確認済みの作品が必要です。');const source=works.find(w=>w.entityId)?.kind;deny(['movie','artist','book'].includes(source),400,'MATERIAL_QUERY','作品の種類を確認してください。');return ['tag',...['movie','artist','book'].filter(k=>k!==source)].map(kind=>materialRequest({kind,entities}));}
export function parseMaterial(body,query){
 deny(typeof body==='string'&&Buffer.byteLength(body)<=262144,502,'MATERIAL_RESPONSE','応答の容量を確認できません。');let d;try{d=JSON.parse(body);}catch{throw new GuardError(502,'MATERIAL_RESPONSE','応答を読み取れません。');}
 let nodes=0;const walk=(v,depth)=>{deny(depth<=14&&++nodes<=30000,502,'MATERIAL_RESPONSE','応答の構造が上限を超えました。');if(v&&typeof v==='object'){deny(Object.keys(v).length<=1000,502,'MATERIAL_RESPONSE','応答の件数が上限を超えました。');Object.values(v).forEach(x=>walk(x,depth+1));}};walk(d,0);
 const items=query.kind==='tag'?d?.results?.tags:d?.results?.entities;deny(d?.success===true&&Array.isArray(items)&&items.length<=(query.kind==='tag'?5:3),502,'MATERIAL_RESPONSE','結果の形式を確認できません。');
 for(const x of items)deny(typeof x.name==='string'&&x.name.length>0&&x.name.length<=300&&(query.kind==='tag'?typeof x.tag_id==='string'&&x.tag_id.startsWith('urn:tag:')&&x.tag_id.length<=300:uuid.test(x.entity_id||'')),502,'MATERIAL_RESPONSE','候補のIDと名前を確認できません。');
 if(query.kind!=='tag')for(const e of items){
  deny(e.subtype===undefined||typeof e.subtype==='string'&&['urn:entity:movie','urn:entity:artist','urn:entity:book'].includes(e.subtype),502,'MATERIAL_RESPONSE','候補の種類を確認できません。');
  if(e.query?.explainability){const x=e.query.explainability['signal.interests.entities'];deny(x===undefined||Array.isArray(x)&&x.length<=18&&x.every(v=>v&&typeof v.entity_id==='string'&&uuid.test(v.entity_id)&&Number.isFinite(v.score)&&v.score>=0&&v.score<=1),502,'MATERIAL_RESPONSE','寄与情報の形式を確認できません。');}
 }
 return d;
}
