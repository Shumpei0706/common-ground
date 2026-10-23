import {deny} from '../scripts/security-core.mjs';
// Coarse traffic shedding only. Never replaces durable action limits or budgets.
// Restart may reset these memory buckets; session/login/create/search limits persist.
export class CloudIngress {
 constructor(beta){this.beta=beta;this.global=new Map();this.sources=new Map();this.prunedAt=null;}
 rate(req,scope,perIp,globalLimit){
  const now=this.beta.state.now(),trim=list=>{while(list.length&&list[0]<=now-60000)list.shift();};
  if(this.prunedAt!==null&&now<this.prunedAt){this.global.clear();this.sources.clear();this.prunedAt=null;}
  if(this.prunedAt===null||now-this.prunedAt>=60000){for(const [key,list] of this.sources){trim(list);if(!list.length)this.sources.delete(key);}this.prunedAt=now;}
  const total=this.global.get(scope)||[];trim(total);deny(total.length<globalLimit,429,'BETA_RATE_LIMIT','Too many requests. Please wait.');
  const key=scope+':'+this.beta.ip(req),list=this.sources.get(key)||[];trim(list);deny(list.length<perIp,429,'BETA_RATE_LIMIT','Too many requests. Please wait.');
  // Global rolling caps bound the number of new identities per minute.
  list.push(now);total.push(now);this.sources.set(key,list);this.global.set(scope,total);
 }
 check(req){
  deny(typeof req.url==='string'&&req.url.length<=2048&&!/[\x00-\x20\x7f]/.test(req.url)&&req.url.startsWith('/')&&!req.url.startsWith('//'),400,'PATH_INVALID','Invalid path.');
  this.rate(req,'requests',300,600);if(req.method==='POST')this.rate(req,'writes',60,120);
 }
}
