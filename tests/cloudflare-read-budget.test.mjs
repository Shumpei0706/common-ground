import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('actual workerd SQLite reads stay bounded with 3000 live events and 120 scheduling passes',{timeout:30000},async()=>{
 const built=await build({entryPoints:[fileURLToPath(new URL('./fixtures/cloudflare-read-budget-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'neutral',external:['node:*','cloudflare:workers'],target:'es2022'});
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'offline-read-budget-fixture',modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-10-22',compatibilityFlags:['nodejs_compat'],bindings:{PUBLIC_ORIGIN:'https://workshop.test',OPERATOR_NAME:'Fixture',OPERATOR_CONTACT:'fixture@workshop.test'},durableObjects:{FIXTURE:{className:'ReadBudgetFixture',useSQLite:true},FAULT:{className:'FailingAlarmWorkshop',useSQLite:true},COUNT:{className:'CountingAlarmWorkshop',useSQLite:true},STARTUP:{className:'StartupFaultWorkshop',useSQLite:true}},outboundService:()=>{throw Error('All external requests are forbidden');}}]}));
 try{
  const read=async path=>{const r=await mf.dispatchFetch('https://workshop.test/'+path),text=await r.text();assert.equal(r.status,200,text);return JSON.parse(text);};
  const legacy=await read('legacy'),improved=await read('improved'),fullHttp=await read('full');
  assert.equal(legacy.passes,120);assert.equal(legacy.sweeps,120);assert.equal(improved.sweeps,2);assert.equal(improved.spent,232);assert.equal(legacy.spent,232);assert.equal(improved.enabled,false);assert.equal(improved.qlooCalls,0);
  assert(legacy.rowsRead>500000,JSON.stringify(legacy));assert(improved.rowsRead<5000,JSON.stringify(improved));assert(improved.rowsRead<legacy.rowsRead/100,JSON.stringify({legacy,improved}));
  assert(fullHttp.rowsRead<10000,JSON.stringify(fullHttp));assert.equal(fullHttp.rowsWritten,0);assert.equal(fullHttp.spent,1000);assert.equal(fullHttp.qlooCalls,0);
  const fault=await mf.dispatchFetch('https://workshop.test/fault',{method:'POST',headers:{Origin:'https://workshop.test','Content-Type':'application/json'},body:'{}'});assert.equal(fault.status,200,await fault.clone().text());assert.match(fault.headers.get('set-cookie'),/__Host-cg_session=.*Secure/);
  const created=await mf.dispatchFetch('https://workshop.test/schedule',{method:'POST',headers:{Origin:'https://workshop.test','Content-Type':'application/json'},body:'{}'});assert.equal(created.status,200);const alarmCalls=created.headers.get('X-Fixture-Alarm-Calls'),cookie=created.headers.get('set-cookie').split(';')[0];
  const unchanged=await mf.dispatchFetch('https://workshop.test/schedule',{headers:{Cookie:cookie}});assert.equal(unchanged.status,200);assert.equal(unchanged.headers.get('X-Fixture-Alarm-Calls'),alarmCalls);
  const denied=await mf.dispatchFetch('https://workshop.test/schedule-operator',{method:'POST',headers:{Origin:'https://workshop.test','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);assert.equal(denied.headers.get('X-Fixture-Alarm-Calls'),alarmCalls);
  const startup=await mf.dispatchFetch('https://workshop.test/startup');assert.equal(startup.status,503);assert.equal(startup.headers.get('X-Fixture-Startup-SQL'),'1');
  const repeated=await mf.dispatchFetch('https://workshop.test/startup');assert.equal(repeated.status,503);assert.equal(repeated.headers.get('X-Fixture-Startup-SQL'),'1');assert(!(await repeated.text()).includes('Injected startup'));
  console.log('Offline workerd cleanup read measurement: '+JSON.stringify({legacy,improved,fullHttp}));
 }finally{await mf.dispose();}
});
