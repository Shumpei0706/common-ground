// Local workerd fixture only. Never configured as the deploy entry point.
import {DurableObject} from 'cloudflare:workers';
import {Workshop} from '../../cloudflare/worker.mjs';
import {cloudRuntime} from '../../cloudflare/runtime.mjs';
import {durableSqlite} from '../../cloudflare/sqlite-adapter.mjs';
import {CloudMaintenance} from '../../cloudflare/maintenance.mjs';
import {createPerspective,mutatePerspective} from '../../scripts/perspectives.mjs';
export class ReadBudgetFixture extends DurableObject{
 async alarm(){}
 async fetch(request){
  const pathname=new URL(request.url).pathname,legacy=pathname==='/legacy',full=pathname==='/full',raw=this.ctx.storage;
  const metrics={rowsRead:0,rowsWritten:0,statements:0};
  const storage={sql:{exec:(...args)=>{const cursor=raw.sql.exec(...args);return {
   *[Symbol.iterator](){try{yield* cursor;}finally{metrics.rowsRead+=cursor.rowsRead;metrics.rowsWritten+=cursor.rowsWritten;metrics.statements++;}},
   get rowsWritten(){return cursor.rowsWritten;}
  };}},transactionSync:fn=>raw.transactionSync(fn),getAlarm:()=>raw.getAlarm(),setAlarm:v=>raw.setAlarm(v),deleteAlarm:()=>raw.deleteAlarm()};
  let now=Date.now();const base=now;
  const app=cloudRuntime(durableSqlite(storage),{id:this.ctx.id.toString(),origin:'https://workshop.test',operatorName:'Local benchmark fixture',contact:'fixture@workshop.test',now:()=>now});
  // Same live rate history and spent metadata in both cases; no private content or keys.
  raw.transactionSync(()=>{
   for(let i=0;i<3000;i++)raw.sql.exec('INSERT INTO creation_events(session,time) VALUES (?,?)','beta:requests:fixture-'+i,base-1800000+i);
   for(let i=0;i<(full?1000:232);i++)raw.sql.exec('INSERT INTO attempts(job,room,day,start,state,result) VALUES (?,?,?,?,?,?)',String(i).padStart(64,'0'),'OLD123','2026-10-22',base-7200000+i,'success','{"discarded":true}');
  });
  if(legacy)for(const index of ['creation_events_time','rooms_expires','sessions_expires','grants_expires','grants_revoked'])raw.sql.exec('DROP INDEX '+index);
  const maintenance=new CloudMaintenance(app,storage);let sweeps=0;
  if(full){
   const host=app.state.issue().session,room=createPerspective(app.state,host,{flow:'cards',size:6,hostPassword:'offline-strong-passphrase'}),people=[];
   room.beta={key:'a'.repeat(43),generation:1,admissions:[],locked:false,policyVersion:app.beta.publicInfo().policyVersion};
   for(let n=0;n<6;n++){const t=app.state.issue();people.push(t);room.beta.admissions.push(t.session.digest);mutatePerspective(room,t.session,'join',{name:'Fixture '+n},now);}
   app.state.saveRoom(room);Object.assign(metrics,{rowsRead:0,rowsWritten:0,statements:0});
   for(let i=0;i<120;i++){
    now=base+Math.floor(i/6)*5000;const revision=app.state.db.revision,swept=maintenance.sweep();if(swept)sweeps++;
    const response=await app.handle(new Request('https://workshop.test/api/gather/'+room.id,{headers:{Cookie:'__Host-cg_session='+people[i%6].cookie,'X-CG-View':'participant'}}),{ip:'198.51.100.1'});
    if(response.status!==200)throw Error('Room GET failed: '+response.status);await response.text();if(swept||revision!==app.state.db.revision)await maintenance.schedule();
   }
   const measured={...metrics};return Response.json({mode:'full-http',passes:120,history:3000,sweeps,...measured,spent:app.state.usage('').total,enabled:app.state.livePermitted(),qlooCalls:0});
  }

  Object.assign(metrics,{rowsRead:0,rowsWritten:0,statements:0});
  // Six participants, twenty rounds at five-second intervals: 120 cleanup/scheduling passes.
  for(let i=0;i<120;i++){now=base+Math.floor(i/6)*5000;if(maintenance.sweep({force:legacy}))sweeps++;await maintenance.schedule();}
  const observed={...metrics};
  Object.assign(metrics,{rowsRead:0,rowsWritten:0,statements:0});app.state.usage('OLD123');const usageRowsRead=metrics.rowsRead;
  return Response.json({mode:legacy?'legacy':'improved',passes:120,history:3000,sweeps,...observed,usageRowsRead,spent:app.state.usage('').total,enabled:app.state.livePermitted(),qlooCalls:0});
 }
}
export class FailingAlarmWorkshop extends Workshop{
 runtime(){const app=super.runtime();this.maintenance.storage={getAlarm:async()=>{throw Error('Injected schedule failure');}};return app;}
}
export class CountingAlarmWorkshop extends Workshop{
 runtime(){const app=super.runtime();this.alarmCalls??=0;const raw=this.ctx.storage;this.maintenance.storage={getAlarm:async()=>{this.alarmCalls++;return raw.getAlarm();},setAlarm:value=>raw.setAlarm(value),deleteAlarm:()=>raw.deleteAlarm()};return app;}
 async fetch(request){const r=await super.fetch(request),headers=new Headers(r.headers);headers.set('X-Fixture-Alarm-Calls',String(this.alarmCalls));return new Response(r.body,{status:r.status,headers});}
}
export class StartupFaultWorkshop extends Workshop{
 constructor(ctx,env){super(ctx,env);this.startupSqlCalls=0;this.ctx={id:ctx.id,storage:{sql:{exec:()=>{this.startupSqlCalls++;throw Error('Injected startup SQL failure');}}}};}
 async fetch(request){const r=await super.fetch(request),headers=new Headers(r.headers);headers.set('X-Fixture-Startup-SQL',String(this.startupSqlCalls));return new Response(r.body,{status:r.status,headers});}
}
export default{fetch(request,env){const mode=new URL(request.url).pathname;if(mode==='/startup')return env.STARTUP.getByName('startup-fault').fetch(new Request('https://workshop.test/api/app-config',request));if(mode==='/schedule'||mode==='/schedule-operator')return env.COUNT.getByName('normal').fetch(new Request('https://workshop.test'+(mode==='/schedule'?'/api/session':'/api/operator/status'),request));if(mode==='/fault')return env.FAULT.getByName('fault').fetch(new Request('https://workshop.test/api/session',request));return env.FIXTURE.getByName(mode).fetch(request);}};
