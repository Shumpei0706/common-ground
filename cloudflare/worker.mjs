import {DurableObject} from 'cloudflare:workers';
import {durableSqlite} from './sqlite-adapter.mjs';
import {cloudRuntime,assets,page,secureHeaders,errorResponse} from './runtime.mjs';
import {deny,GuardError} from '../scripts/security-core.mjs';
import {CloudMaintenance} from './maintenance.mjs';
export class Workshop extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.app=null;this.maintenance=null;this.retryStartupAt=0;}
 runtime(){if(!this.app){if(Date.now()<this.retryStartupAt)throw new GuardError(503,'SERVICE_UNAVAILABLE','The service is temporarily unavailable.');try{this.app=cloudRuntime(durableSqlite(this.ctx.storage),{id:this.ctx.id.toString(),origin:this.env.PUBLIC_ORIGIN,operatorName:this.env.OPERATOR_NAME,contact:this.env.OPERATOR_CONTACT,baselineHash:this.env.CG_BASELINE_HASH,apiKey:this.env.QLOO_API_KEY});this.maintenance=new CloudMaintenance(this.app,this.ctx.storage);}catch(e){this.app=null;this.maintenance=null;this.retryStartupAt=Date.now()+60000;throw e;}}return this.app;}
 async fetch(request){
  let response,swept=false,revision=null;try{const app=this.runtime();revision=app.state.db.revision;swept=this.maintenance.sweep();response=await app.handle(request,{ip:request.headers.get('CF-Connecting-IP'),adminToken:this.env.CG_ADMIN_TOKEN});}catch(e){response=errorResponse(e);}
  // Keep a committed response and its cookie if later housekeeping fails.
  // Logical expiry and the exact pre-send budget remain independently checked.
  if(this.app&&this.maintenance&&(swept||revision!==this.app.state.db.revision))try{await this.maintenance.schedule();}catch{this.maintenance.lastSweep=null;}
  return response;
 }
 async alarm(){this.runtime();this.maintenance.sweep({force:true});await this.maintenance.schedule();}

}
export default{
 async fetch(request,env){try{
  const url=new URL(request.url);deny(url.origin===env.PUBLIC_ORIGIN&&url.protocol==='https:',403,'HOST_DENIED','Invalid origin.');deny(url.pathname===decodeURIComponent(url.pathname)&&!url.pathname.includes('\\')&&!url.pathname.includes('\0')&&url.href.length<=2048,400,'PATH_INVALID','Invalid path.');
  if(url.pathname.startsWith('/api/')){const headers=new Headers(request.headers);for(const name of ['x-real-ip','x-forwarded-for','x-forwarded-host','x-forwarded-proto','forwarded'])headers.delete(name);headers.set('CF-Connecting-IP',request.headers.get('CF-Connecting-IP')||'0.0.0.0');return await env.WORKSHOP.getByName('common-ground-test-ledger-v1').fetch(new Request(request,{headers}));}
  deny(['GET','HEAD'].includes(request.method),405,'METHOD_DENIED','Unsupported method.');deny(page(url.pathname)||assets.has(url.pathname),404,'PAGE_MISSING','This page is unavailable.');const target=new URL(request.url);target.pathname=page(url.pathname)?'/gather.html':url.pathname;target.search='';const result=await env.ASSETS.fetch(new Request(target,{method:request.method}));const headers=secureHeaders();headers.set('Content-Type',result.headers.get('Content-Type')||'application/octet-stream');return new Response(result.body,{status:result.status,headers});
 }catch(e){return errorResponse(e);}}
};
