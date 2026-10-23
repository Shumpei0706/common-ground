import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync,existsSync,writeFileSync,readFileSync,lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {SecurityCore,deny,hash} from './security-core.mjs';
export * from './security-core.mjs';
export class SecurityState extends SecurityCore {
 constructor(filename=':memory:',{now=()=>Date.now()}={}){
  let fresh=filename===':memory:';
  if(filename!==':memory:'){
   const dir=path.dirname(filename);mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
   const marker=filename+'.guard';
   deny(!(existsSync(marker)&&!existsSync(filename)),503,'LEDGER_MISSING','安全台帳が見つかりません。実接続は停止します。');
   if(!existsSync(marker)){fresh=true;deny(!existsSync(filename),503,'LEDGER_UNTRUSTED','未確認の台帳は使用できません。');writeFileSync(filename,'',{flag:'wx',mode:0o600});writeFileSync(marker,'Common Ground safety ledger v1\n',{flag:'wx',mode:0o600});}
   deny(readFileSync(marker,'utf8')==='Common Ground safety ledger v1\n',503,'LEDGER_UNTRUSTED','台帳の管理情報を確認できません。');chmodSync(filename,0o600);
  }
  const db=new DatabaseSync(filename);db.exec('PRAGMA busy_timeout=1000; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;');
  deny(db.prepare('PRAGMA quick_check').get().quick_check==='ok',503,'LEDGER_CORRUPT','安全台帳を確認できません。');
  if(!fresh){const names=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));deny(['config','sessions','rooms','grants','attempts','creation_events'].every(n=>names.has(n)),503,'LEDGER_SCHEMA','安全台帳の構造を確認できません。');}
  super(db,{now,filename,fresh});
 }
 ledgerBinding(){if(this.filename===':memory:')return 'memory-only-fixture';const stat=lstatSync(this.filename);deny(stat.isFile()&&!stat.isSymbolicLink(),503,'LEDGER_BINDING_REQUIRED','Use the canonical ledger file.');return hash(JSON.stringify({path:realpathSync(this.filename),device:stat.dev,inode:stat.ino}));}
}
