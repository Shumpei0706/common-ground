import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {readLanguage,writeLanguage,copyFor,featureText} from '../web/gather-i18n.js';
import {policies} from '../web/gather-policy-copy.js';
import {mergeDraftVersion,draftConflict} from '../web/gather-state.js';
const source=(await readFile(new URL('../web/gather.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const room=id=>({id,flow:'cards',title:'Fixture room',mode:'first',stage:'prepare',revision:1,size:3,members:[],expiresAt:Date.now()+7200000,beta:{enabled:true,hasOwnData:true},me:{id:'current-member',version:1,status:'preparing',externalConsent:false,baseline:{works:[{id:'free',title:'Current work',kind:'movie'}],elements:['Current words']},material:null}});
async function fixture({fragment='',path='/my/ABC123',override,initialStorage={},sessionRef='current-session'}={}){
 const calls=[],replacements=[],handlers={},storage={...initialStorage,getItem(k){return this[k]??null;},setItem(k,v){this[k]=v;},removeItem(k){delete this[k];}},app={html:'',set innerHTML(v){this.html=v;},get innerHTML(){return this.html;}};
 const location={pathname:path,origin:'http://127.0.0.1:4173',hash:fragment};let current=room('ABC123');
 const document={hidden:false,activeElement:null,documentElement:{},querySelector:s=>s==='#app'?app:s==='#notice'?{textContent:''}:null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener:(name,fn)=>handlers[name]=fn};
 const context=vm.createContext({policies,readLanguage,writeLanguage,copyFor,featureText,mergeDraftVersion,draftConflict,document,location,window:{addEventListener(){},scrollTo(){}},history:{pushState(a,b,path){location.pathname=path;location.hash='';},replaceState(a,b,path){replacements.push(path);location.pathname=path;location.hash='';}},navigator:{locks:{request:(name,fn)=>fn()}},localStorage:{getItem(){return 'en';},setItem(){}},sessionStorage:storage,setTimeout(){},clearTimeout(){},setInterval(){},fetch:async(url,options={})=>{calls.push({url,hash:location.hash,body:options.body});const custom=override?.(url,options);if(custom)return custom;return {ok:true,status:200,json:async()=>url==='/api/session'?{csrf:'fixture',sessionRef}:url==='/api/app-config'?{beta:{enabled:true,preview:true,policyVersion:'2026-10-21-beta-1'}}:structuredClone({...current,id:url.split('/').at(-1)})};}});
 await vm.runInContext('(async()=>{'+source+';globalThis.betaTest={run,navigate,poll,snapshot:()=>({room,draft,confirmation,accessRequired})};})()',context);
 return {api:context.betaTest,app,calls,replacements,storage,handlers,update:r=>current=r};
}
test('participant fragment is removed before first request, exchanged once and never serialized into draft storage',async()=>{
 const capability='T'.repeat(43),f=await fixture({path:'/enter/ABC123',fragment:'#invite='+capability});assert.deepEqual(f.replacements,['/enter/ABC123']);assert(f.calls.every(c=>c.hash===''));const access=f.calls.filter(c=>c.url.endsWith('/access'));assert.equal(access.length,1);assert.equal(JSON.parse(access[0].body).invitation,capability);assert(!JSON.stringify(f.storage).includes(capability));
});
test('missing admission renders an access form without room data; session change clears every old room draft',async()=>{
 const old=JSON.stringify({schema:1,memberId:'old-member',initial:['OLD_PRIVATE'],final:['OLD_PRIVATE'],updatedAt:Date.now(),references:[],candidateIds:[]});const f=await fixture({initialStorage:{'cg-session-owner':'old-session','cg-element-cards-ABC123':old,'cg-element-cards-DEF456':old},override:url=>url==='/api/gather/ABC123'?{ok:false,status:403,json:async()=>({code:'ROOM_ACCESS_REQUIRED'})}:null});assert.equal(f.api.snapshot().accessRequired,true);assert(f.app.html.includes(copyFor('en').betaAccessTitle));assert(!f.app.html.includes('Fixture room'));assert(!f.app.html.includes('OLD_PRIVATE'));assert.equal(f.storage.getItem('cg-element-cards-ABC123'),null);assert.equal(f.storage.getItem('cg-element-cards-DEF456'),null);
});
test('deletion response after navigation cannot replace the new room or its draft',async()=>{
 const gate=deferred(),f=await fixture({override:url=>url.endsWith('/erase-mine')?gate.promise:null});await f.api.run('erase-mine',{dataset:{}});const pending=f.api.run('delete-confirm',{dataset:{}});await f.api.navigate('/my/DEF456');gate.resolve({ok:true,status:200,json:async()=>({deleted:true})});await pending;assert.equal(f.api.snapshot().room.id,'DEF456');assert.equal(f.api.snapshot().draft.title,'Current work');
});
test('a saved draft from a different member is never adopted after joining again',async()=>{
 const old=JSON.stringify({schema:1,memberId:'other-member',initial:['OTHER_PRIVATE'],final:['OTHER_PRIVATE'],updatedAt:Date.now(),references:[],candidateIds:[],title:'OTHER_PRIVATE'});const f=await fixture({initialStorage:{'cg-session-owner':'current-session','cg-element-cards-ABC123':old}});assert.equal(f.api.snapshot().draft.memberId,'current-member');assert.equal(f.api.snapshot().draft.title,'Current work');assert(!JSON.stringify(f.api.snapshot().draft).includes('OTHER_PRIVATE'));
});

test('transient invitation exchange failure keeps key only in memory and displays actionable error after fragment removal',async()=>{
 const capability='F'.repeat(43),f=await fixture({path:'/enter/ABC123',fragment:'#invite='+capability,override:url=>url.endsWith('/access')?{ok:false,status:503,json:async()=>({code:'BETA_RATE_LIMIT'})}:url==='/api/gather/ABC123'?{ok:false,status:403,json:async()=>({code:'ROOM_ACCESS_REQUIRED'})}:null});assert(f.app.html.includes(copyFor('en').betaRateLimited));assert(f.app.html.includes('value="'+capability+'"'));assert(!JSON.stringify(f.storage).includes(capability));assert(f.calls.every(c=>c.hash===''));
});
test('revoked invitation is cleared from the form and reports an invalid link, never falling back to room-code access',async()=>{
 const capability='R'.repeat(43),f=await fixture({path:'/enter/ABC123',fragment:'#invite='+capability,override:url=>url.endsWith('/access')?{ok:false,status:403,json:async()=>({code:'ROOM_ACCESS_REQUIRED'})}:url==='/api/gather/ABC123'?{ok:false,status:403,json:async()=>({code:'ROOM_ACCESS_REQUIRED'})}:null});assert(f.app.html.includes(copyFor('en').betaInviteInvalid));assert(!f.app.html.includes(capability));assert(!JSON.stringify(f.storage).includes(capability));assert.equal(f.api.snapshot().accessRequired,true);
});


test('an existing participant opening an obsolete invitation sees the accessible room without an invalid-link error',async()=>{
 const f=await fixture({fragment:'#invite='+'O'.repeat(43),override:url=>url.endsWith('/access')?{ok:false,status:403,json:async()=>({code:'ROOM_ACCESS_REQUIRED'})}:null});assert.equal(f.api.snapshot().accessRequired,false);assert.equal(f.api.snapshot().room.me.id,'current-member');assert(!f.app.html.includes(copyFor('en').betaInviteInvalid));
});
