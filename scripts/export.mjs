import { curiosityEntries, originText, reactionText, retainedCandidates, existingLinkText, emptyTakeawayText } from '../web/presentation.js';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wrap=(s,max=34)=>{const chars=[...String(s)];return Array.from({length:Math.max(1,Math.ceil(chars.length/max))},(_,n)=>chars.slice(n*max,(n+1)*max).join(''));};
export function exportCard(room,names=false){
 let top=83+wrap(room.title,40).length*29+34;const rows=[];
 if(room.replay?.label){for(const line of wrap(room.replay.label,70)){rows.push(`<text x="35" y="${top}" font-size="14">${escape(line)}</text>`);top+=23;}top+=25;}
 for(let n=0;n<room.map.length;n+=2){let height=0;const groups=room.map.slice(n,n+2).map((p,col)=>{let y=32;const items=p.items.map(i=>{const lines=wrap(i.title),size=lines.length*20+16;const item=`<rect x="0" y="${y-3}" width="470" height="${size}" rx="3" fill="#edf2f5"/>${lines.map((line,j)=>`<text x="12" y="${y+17+j*20}" font-size="14">${escape(line)}</text>`).join('')}`;y+=size+8;return item;}).join('');height=Math.max(height,y);return `<g transform="translate(${col?570:35},${top})"><text font-size="17">${escape(names?p.name:'参加者'+(n+col+1))}</text>${items||'<text y="38" font-size="14">カードなしで参加</text>'}</g>`;});rows.push(groups.join(''));top+=height+36;}
 const text=(value,size=14)=>{for(const line of wrap(value,size>=17?50:70)){rows.push(`<text x="35" y="${top}" font-size="${size}">${escape(line)}</text>`);top+=size+9;}};
 text('作品から広がる候補',18);text('本人が持ち寄った好きとは分けて残します。');top+=10;
 for(const c of retainedCandidates(room)){text(c.title+'（'+c.label+'）',16);text('起点：'+originText(room,c,names));text(reactionText(room,c.id));top+=16;}
 if(!retainedCandidates(room).length){text(emptyTakeawayText(room));top+=16;}
 if(room.existingLinks?.length){text('持ち寄った好き同士の接点',18);for(const link of room.existingLinks){text(existingLinkText(room,link,names));top+=8;}text('起点からの推薦です。逆向きの推薦を意味しません。');top+=16;}
 text('気になった、ほかの人の好き',18);const curiosity=curiosityEntries(room,names);
 for(const entry of curiosity){text(`${entry.owner}の「${entry.title}」`);text(entry.summary);top+=8;}
 if(!curiosity.length)text('まだ反応はありません。');top+=22;
 text('チームの発見',18);text(room.memo||'発見メモはまだありません。');top+=25;
 const height=top+45;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}"><rect width="1080" height="${height}" fill="#f6f8fa"/><g fill="#202938" font-family="sans-serif"><text x="35" y="40" font-size="14">COMMON GROUND / 好きと発見の記録</text>${wrap(room.title,40).map((t,i)=>`<text x="35" y="${83+i*29}" font-size="24">${escape(t)}</text>`).join('')}${rows.join('')}<text x="35" y="${height-20}" font-size="12">好き・候補・本人の反応は別の情報です。名前${names?'あり':'なし'}版。</text></g></svg>`;
}
