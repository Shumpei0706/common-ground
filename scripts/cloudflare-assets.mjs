import {mkdir,readdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {assets} from '../cloudflare/public-files.mjs';
const target=new URL('../dist/cloudflare-assets/',import.meta.url);await mkdir(target,{recursive:true});
for(const file of await readdir(target))if(!assets.has('/'+file))throw Error('Unexpected file in the generated public asset directory.');
for(const file of assets)await copyFile(new URL('../web'+file,import.meta.url),new URL('.'+file,target));
console.log('Prepared '+assets.size+' approved public files at '+fileURLToPath(target));
