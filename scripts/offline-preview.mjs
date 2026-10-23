// Portable, loopback-only card preview. All state is ephemeral and Qloo stays off.
import {createApp} from './serve.mjs';
if(process.argv.length!==2){console.error('Usage: node scripts/offline-preview.mjs');process.exit(1);}
const preview=createApp({dbPath:':memory:',deployment:{preview:true}});
let closing=false;
function close(code=0){
 if(closing)return;closing=true;
 preview.server.closeAllConnections();
 preview.server.close(()=>{preview.state.close();process.exit(code);});
}
preview.server.once('error',()=>{console.error('Cannot open http://127.0.0.1:4173. Check whether the preview is already running.');preview.state.close();process.exit(1);});
preview.server.listen(4173,'127.0.0.1',()=>{
 console.log('Common Ground local preview: http://127.0.0.1:4173');
 console.log('Data lasts only for this process. Qloo is off. No production ledger is opened.');
 console.log('Local-only host invitation (single use, valid for 1 hour): '+preview.beta.issueInvite());
});
process.once('SIGINT',()=>close());process.once('SIGTERM',()=>close());
