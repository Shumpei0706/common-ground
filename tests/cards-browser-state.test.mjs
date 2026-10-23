import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {copy} from '../web/gather-cards-copy.js';
import {readLanguage,writeLanguage,copyFor,featureText} from '../web/gather-i18n.js';
import {featureLabels} from '../web/qloo-feature-labels.js';
import {mergeDraftVersion,draftConflict} from '../web/gather-state.js';
const source=(await readFile(new URL('../web/gather.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const room=id=>({id,flow:'cards',title:id,mode:'first',stage:'prepare',revision:1,size:3,members:[],searchAvailable:true,me:{id:'person',version:1,status:'preparing',externalConsent:false,baseline:{works:[{id:'free',title:'My work',kind:'movie'}],elements:['余白']},material:null}});
async function fixture(override){
 const handlers={},timers=[],calls=[],store=new Map();let paints=0,current=room('AAA111');
 const app={set innerHTML(v){this.html=v;paints++;},get innerHTML(){return this.html;}};
 const document={hidden:false,activeElement:null,title:'',querySelector:s=>s==='#app'?app:s==='#notice'?{textContent:''}:null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener:(n,fn)=>handlers[n]=fn};
 const location={pathname:'/my/AAA111',origin:'http://127.0.0.1:4173'};
 const context=vm.createContext({FormData:class{constructor(form){this.form=form;}[Symbol.iterator](){return Object.entries(this.form.values||{})[Symbol.iterator]();}},c:copy,featureLabels,readLanguage,writeLanguage,copyFor,featureText,mergeDraftVersion,draftConflict,document,location,window:{addEventListener(){},scrollTo(){}},history:{pushState(a,b,path){location.pathname=path;}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},navigator:{locks:{request:(name,fn)=>fn()}},sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},setTimeout:fn=>timers.push(fn),clearTimeout(){},setInterval(){},fetch:async(url,options)=>{calls.push(url);const response=override?.(url,options);if(response)return response;return {ok:true,status:200,json:async()=>url==='/api/session'?{csrf:'fixture'}:structuredClone({...current,id:url.split('/').at(-1)})};}});
 await vm.runInContext('(async()=>{'+source+';globalThis.cardsTest={run,search,navigate,poll,errorCopy,setDraft:v=>Object.assign(draft,v),setResults:v=>results=v,snapshot:()=>({id:room?.id,results,draft})};})()',context);
 return {api:context.cardsTest,app,handlers,timers,calls,paints:()=>paints,update:r=>current=r};
}
test('late Qloo title-search response cannot populate a different card room',async()=>{
 const gate=deferred(),f=await fixture(url=>url.endsWith('/search')?gate.promise:null);
 const pending=f.api.search('Original','movie');await f.api.navigate('/my/BBB222');gate.resolve({ok:true,json:async()=>({entities:[{id:'stale',title:'Stale title'}]})});await assert.rejects(pending,{code:'VIEW_CHANGED'});assert.equal(f.api.snapshot().id,'BBB222');assert.equal(f.api.snapshot().results.length,0);
});
test('leaving while selecting a formal work cannot start a material request in the new room',async()=>{
 const gate=deferred(),f=await fixture(url=>url==='/api/gather/AAA111/baseline'?gate.promise:null);
 f.api.setResults([{id:'chosen',title:'Chosen title',kind:'movie'}]);const pending=f.api.run('pick-result',{dataset:{id:'chosen'}});await f.api.navigate('/my/BBB222');gate.resolve({ok:true,json:async()=>room('AAA111')});await pending;assert.equal(f.api.snapshot().id,'BBB222');assert(!f.calls.some(url=>url.endsWith('/materials')));assert.notEqual(f.api.snapshot().draft.title,'Chosen title');
});
test('another participant update cannot replace the Japanese IME field before composition ends',async()=>{
 const f=await fixture();f.handlers.compositionstart();const paints=f.paints();const updated=room('AAA111');updated.revision=2;f.update(updated);await f.api.poll();assert.equal(f.paints(),paints);f.handlers.compositionend({target:{dataset:{token:'final'},value:'音の余白'}});assert.equal(f.api.snapshot().draft.pendingFinal,'音の余白');for(const timer of f.timers)timer();assert(f.paints()>paints);assert.equal(f.api.snapshot().draft.pendingFinal,'音の余白');
});

test('late host-login display fallback cannot overwrite another room after navigation',async()=>{
 const gate=deferred(),entered=deferred(),f=await fixture((url,options)=>{if(url!=='/api/gather/AAA111')return null;const view=options.headers['X-CG-View'];if(view==='host')return {ok:false,status:403,json:async()=>({code:'HOST_REQUIRED'})};if(view==='display'){entered.resolve();return gate.promise;}return null;});
 const pending=f.api.navigate('/facilitate/AAA111');await entered.promise;await f.api.navigate('/my/BBB222');gate.resolve({ok:true,status:200,json:async()=>({...room('AAA111'),me:null})});await pending;assert.equal(f.api.snapshot().id,'BBB222');assert.equal(f.api.snapshot().draft.title,'My work');
});

test('changing language then removing a Qloo word preserves the separately written English word',async()=>{
 const initial=room('AAA111');initial.me.baseline.elements=['Focused'];initial.me.material={tags:[{id:'focus',original:'Focused',label:'没入感'}]};const f=await fixture(url=>url==='/api/gather/AAA111'?{ok:true,json:async()=>structuredClone(initial)}:null);
 f.handlers.change({target:{id:'language',value:'ja'}});await f.api.run('tag',{dataset:{id:'focus'}});assert.deepEqual(Array.from(f.api.snapshot().draft.final),['Focused','没入感']);f.handlers.change({target:{id:'language',value:'en'}});await f.api.run('tag',{dataset:{id:'focus'}});assert.deepEqual(Array.from(f.api.snapshot().draft.final),['Focused']);assert.equal(f.api.snapshot().draft.references.length,0);
});
test('adopting then removing a case-equivalent Qloo word does not delete the original input',async()=>{
 const initial=room('AAA111');initial.me.baseline.elements=['focused'];initial.me.material={tags:[{id:'focus',original:'Focused',label:'没入感'}]};const f=await fixture(url=>url==='/api/gather/AAA111'?{ok:true,json:async()=>structuredClone(initial)}:null);
 await f.api.run('tag',{dataset:{id:'focus'}});assert.equal(f.api.snapshot().draft.referenceWords.focus,'focused');assert.deepEqual(Array.from(f.api.snapshot().draft.final),['focused']);await f.api.run('tag',{dataset:{id:'focus'}});assert.deepEqual(Array.from(f.api.snapshot().draft.final),['focused']);
});


test('reload hydrates Qloo provenance and attachments; unpublish/resume preserve them without another lookup',async()=>{
 const r=room('AAA111'),tag={id:'tag-poetic',label:'Poetic',original:'Poetic',word:'Poetic',added:true,proof:{source:'SYNTHETIC FIXTURE'}};r.me.published={elements:['Quiet','Poetic'],references:[tag],candidates:[{id:'related-one'}]};r.me.baseline.elements=['Quiet'];r.me.material={state:'complete',tags:[tag],candidates:[]};let sent;
 const f=await fixture((url,opts)=>{if(url==='/api/gather/AAA111')return {ok:true,json:async()=>structuredClone(r)};if(url.endsWith('/withdraw')){r.me.cardDraft=r.me.published;r.me.published=null;r.me.status='listener';r.me.version++;return {ok:true,json:async()=>structuredClone(r)};}if(url.endsWith('/resume')){r.me.status='preparing';r.me.version++;return {ok:true,json:async()=>structuredClone(r)};}if(url.endsWith('/publish')){sent=JSON.parse(opts.body);return {ok:true,json:async()=>structuredClone(r)};}});
 assert.deepEqual(Array.from(f.api.snapshot().draft.references),['tag-poetic']);assert.equal(f.api.snapshot().draft.referenceWords['tag-poetic'],'Poetic');assert.equal(f.api.snapshot().draft.referenceAdded['tag-poetic'],true);await f.api.run('withdraw',{dataset:{}});await f.api.run('resume',{dataset:{}});await f.api.run('publish',{dataset:{}});assert.deepEqual(sent.references,['tag-poetic']);assert.deepEqual(sent.candidateIds,['related-one']);assert.equal(sent.referenceAdded['tag-poetic'],true);assert(!f.calls.some(x=>x.endsWith('/search')||x.endsWith('/materials')));
});
test('back to initial input keeps final authored edits and Qloo proof for same source; changed source clears only added Qloo words',async()=>{
 const r=room('AAA111');r.me.baseline.elements=['Quiet'];r.me.material={state:'complete',tags:[{id:'tag',label:'Poetic',original:'Poetic'}],candidates:[]};
 const f=await fixture((url,opts)=>{if(url==='/api/gather/AAA111')return {ok:true,json:async()=>structuredClone(r)};if(url.endsWith('/baseline')){const data=JSON.parse(opts.body),source=data.works[0];r.me.baseline={works:[{id:'free',title:source.title,kind:source.kind}],elements:data.elements};r.me.version++;if(source.title!=='My work')r.me.material=null;return {ok:true,json:async()=>structuredClone(r)};}});
 f.api.setDraft({initial:['Quiet','Wonder'],final:['Quiet','Poetic','Handwritten'],references:['tag'],referenceWords:{tag:'Poetic'},referenceAdded:{tag:true},candidateIds:['related'],title:'My work',kind:'movie'});const form={dataset:{form:'baseline'},closest(){return this;},values:{}};await f.handlers.submit({target:form,preventDefault(){}});assert.deepEqual(Array.from(f.api.snapshot().draft.final),['Quiet','Poetic','Handwritten','Wonder']);assert.deepEqual(Array.from(f.api.snapshot().draft.references),['tag']);assert.deepEqual(Array.from(f.api.snapshot().draft.candidateIds),['related']);
 f.api.setDraft({title:'Different work',work:null});await f.handlers.submit({target:form,preventDefault(){}});assert.deepEqual(Array.from(f.api.snapshot().draft.final),['Quiet','Handwritten','Wonder']);assert.equal(f.api.snapshot().draft.references.length,0);assert.equal(f.api.snapshot().draft.candidateIds.length,0);assert(!f.calls.some(x=>x.endsWith('/search')||x.endsWith('/materials')));
});
test('Qloo OFF omits dead lookup controls and preserves the explicit publication action',async()=>{
 const r=room('AAA111');r.searchAvailable=false;const f=await fixture(url=>url==='/api/gather/AAA111'?{ok:true,json:async()=>structuredClone(r)}:null);assert(!f.app.html.includes('data-action="open-hints"'));assert(!f.app.html.includes('data-form="lookup"'));assert(f.app.html.includes('data-action="publish"'));
});
