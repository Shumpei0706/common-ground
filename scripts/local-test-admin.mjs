import { SecurityState, STATE_PATH, snapshotHash, deny, GuardError } from './security-state.mjs';
import { OFFICIAL_ORIGIN } from './qloo-installation.mjs';
import { pathToFileURL } from 'node:url';
export function authorizeLocalTest(state,ceiling=100){
 if(state.policy().cloudRetirement)throw new GuardError(423,'LEDGER_RETIRED','This local ledger was retired to Cloudflare.');
 deny(!state.policy().publicBetaAuthorization,423,'PUBLIC_LEDGER_BOUND','この台帳は公開用の許可に結びついています。ローカル起動で許可を置き換えません。');
 deny([100,200,500].includes(ceiling)&&state.usage('').total<=ceiling,400,'AUTHORIZATION_INVALID','許可された累積上限を確認してください。');
 deny(state.filename===':memory:'||state.filename===STATE_PATH||!!state.policy().liveLedgerBinding&&state.bindingMatches(),503,'LEDGER_BINDING_REQUIRED','Local live authorization requires the canonical ledger.');state.bindLiveLedger();
 const expiresAt=ceiling>=200?state.now()+2*3600000:state.policy().localTestAuthorization?.expiresAt||state.now()+12*3600000;
 return state.configure({enabled:true,confirmedFree:false,total:ceiling,daily:Math.min(ceiling,200),room:30,localTestAuthorization:{absoluteCeiling:ceiling,endpoint:OFFICIAL_ORIGIN,expiresAt,...(ceiling>=200?{rooms:[]}:{}),authorizationId:ceiling===500?'CG-020-user-authorized-local-card-flow':ceiling===200?'CG-012-user-authorized-group-size-e2e':'CG-009-user-authorized-local-e2e'}});
}
export function allowLocalRoom(state,code){
 deny(/^[A-F0-9]{6}$/.test(code||''),400,'ROOM_INVALID','ルームコードを確認してください。');
 const r=state.loadRoom(code),policy=state.policy();deny(!r.demo&&state.livePermitted(),423,'LOCAL_DISABLED','ローカル検証の許可がありません。');
 if(Array.isArray(policy.localTestAuthorization?.rooms)){const rooms=[...new Set([...policy.localTestAuthorization.rooms,code])];deny(rooms.length<=100,400,'SCOPE_INVALID','許可するルームが多すぎます。');state.configure({localTestAuthorization:{...policy.localTestAuthorization,rooms}});}
 state.grant(code,snapshotHash(r),{cap:30,expires:Math.min(r.created+7200000,policy.localTestAuthorization.expiresAt)});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
const [command,code]=process.argv.slice(2);let state;
try{
 state=new SecurityState(STATE_PATH);
 if(['authorize-100','authorize-200','authorize-500'].includes(command)){
  const ceiling=command==='authorize-500'?500:command==='authorize-200'?200:100;authorizeLocalTest(state,ceiling);
  console.log(`ローカル検証を過去分を含む累積${ceiling}回に限定して許可しました。検証の許可窓は今回から2時間、対象ルームは別途許可が必要です。`);
 }else if(command==='allow-room'){
  allowLocalRoom(state,code);
  console.log('このルームに最大30回の検証を許可しました。累積上限を超えて補充しません。');
 }else if(command==='status')console.log(JSON.stringify({live:state.livePermitted(),used:state.usage(code||''),ceiling:Math.min(state.policy().total,state.policy().localTestAuthorization?.absoluteCeiling??state.policy().total)},null,2));
 else if(command==='stop'){state.stop();console.log('実APIを停止しました。');}
 else throw Error('ARGUMENT');
}catch{console.error('ローカル検証の設定を完了できませんでした。秘密情報は出力しません。');process.exitCode=1;}finally{state?.close();}

}
