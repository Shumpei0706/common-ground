export const reactionLabels={like:'知ってる・好き',curious:'気になる',pass:'今回はちがう',together:'一緒に触れてみたい'};
export function reactionText(room,target){const values=Object.entries(reactionLabels).map(([v,label])=>({label,count:room.reactions.find(r=>r.target===target&&r.value===v)?.count||0})).filter(r=>r.count);return values.map(r=>`${r.label} ${r.count}件`).join(' / ')||'まだ反応はありません';}
export function curiosityEntries(room,names=false){return room.map.flatMap((person,n)=>person.items.flatMap(item=>{
 const target=person.id+':'+item.id,reactions=room.reactions.filter(r=>r.target===target&&['curious','novel'].includes(r.value));
 if(!reactions.length)return [];
 return [{owner:names?person.name:'参加者'+(n+1),title:item.title,summary:reactions.map(r=>`${r.value==='novel'?'初めて知った':'聞いてみたい'} ${r.count}件`).join(' / ')}];
}));}
export function originText(room,candidate,names=false){return candidate.endpoints.map(ep=>{const n=room.map.findIndex(p=>p.id===ep.member),person=room.map[n];if(!person)return '';const item=person.items.find(i=>i.id===ep.item);return `${names?person.name:'参加者'+(n+1)}の「${item?.title||ep.title||'作品'}」`;}).filter(Boolean).join(' / ');}
export function metadataText(detail,title=''){let s=String(detail||'').trim();s=s.replace(/^(\d{4}) · \1,/, '$1,').replace(/^(\d{4}) · \1$/, '$1');return s===title?'':s;}
export const localizedTitles={'星の王子さま':{kind:'book',text:'The Little Prince'},'海辺のカフカ':{kind:'book',text:'Kafka on the Shore'},'千と千尋の神隠し':{kind:'movie',text:'Spirited Away'},'グランド・ブダペスト・ホテル':{kind:'movie',text:'The Grand Budapest Hotel'},'スピッツ':{kind:'artist',text:'Spitz'}};

// Connect at facing edges: a center-to-center curve can emerge through a
// different card stacked below the actual origin and imply the wrong source.
export function connectionAnchors(a,b){
 const ac=[a.x+a.width/2,a.y+a.height/2],bc=[b.x+b.width/2,b.y+b.height/2];
 const dx=bc[0]-ac[0],dy=bc[1]-ac[1];
 if(Math.abs(dx)>=Math.abs(dy)){const sign=dx>=0?1:-1;return [[ac[0]+sign*a.width/2,ac[1]],[bc[0]-sign*b.width/2,bc[1]]];}
 const sign=dy>=0?1:-1;return [[ac[0],ac[1]+sign*a.height/2],[bc[0],bc[1]-sign*b.height/2]];
}
export const sharedCandidates=room=>room.candidates.filter(c=>!c.category||c.category==='shared');
export const detourCandidates=room=>room.candidates.filter(c=>c.category==='detour');
export const retainedCandidates=room=>room.candidates.filter(c=>!c.category||c.category==='shared'||room.reactions.some(r=>r.target===c.id&&r.count>0));
export function existingLinkText(room,link,names=false){
 const label=ep=>{const n=room.map.findIndex(p=>p.id===ep.member),person=room.map[n];return `${names?person?.name||'参加者':'参加者'+(n+1)}の「${person?.items.find(i=>i.id===ep.item)?.title||ep.title||'作品'}」`;};
 return (link.synthetic?'［架空の操作例・Qloo実結果ではありません］ ':'')+link.from.map(label).join(' / ')+' → '+label(link.to);
}

export function emptyTakeawayText(room){if(room.candidates?.length)return '寄り道の候補は地図にあります。反応を置くと、ここにも残ります。'+(room.analysis?.state==='stopped'?'一部の照会は未確認です。':'');return room.analysis?.state==='stopped'?'探索には未確認の部分があります。確認済みの範囲では、保存する接点候補はありません。':'保存する接点候補はまだありません。持ち寄った好きは地図に残っています。';}
