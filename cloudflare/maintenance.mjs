// Physical cleanup is bounded; every access still checks its own logical expiry.
// No auth, room contents or Qloo budget decisions are cached here.
export class CloudMaintenance {
 constructor(app,storage){this.app=app;this.storage=storage;this.lastSweep=null;}
 sweep({force=false}={}){
  const {state,beta}=this.app,now=state.now();
  if(!force&&this.lastSweep!==null&&now>=this.lastSweep&&now-this.lastSweep<60000)return false;
  state.sweep();beta.sweep();this.lastSweep=now;return true;
 }
 async schedule(){
  const s=this.app.state,now=s.now(),dates=[
   s.db.prepare('SELECT MIN(expires) AS n FROM rooms').get().n,
   s.db.prepare('SELECT MIN(expires) AS n FROM sessions').get().n,
   s.db.prepare('SELECT MIN(time)+3600000 AS n FROM creation_events').get().n,
   ...s.policy().betaSecurity.invites.map(i=>i.expires)
  ].filter(Number.isFinite);
  const alarm=await this.storage.getAlarm();
  if(dates.length){const due=Math.max(now+1,Math.min(...dates),(this.lastSweep??-Infinity)+60000);if(!alarm||alarm>due)await this.storage.setAlarm(due);}
  else if(alarm!==null)await this.storage.deleteAlarm();
 }
}
