import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const QLOO_HOME_DIR='./.common-ground/private/qloo-cli';
export const QLOO_CONFIG=path.join(QLOO_HOME_DIR,'config');
export const CLI_ROOT='./node_modules/@qloo/qloo-harness';
// Issuer-provided URL, confirmed by the official hackathon developer guide.
export const OFFICIAL_ORIGIN='https://hackathon.api.qloo.com';
export function verifyInstallation(){
 const lock=JSON.parse(readFileSync(fileURLToPath(new URL('../tools/qloo-cli.lock.json',import.meta.url)),'utf8'));
 const pkg=JSON.parse(readFileSync(path.join(CLI_ROOT,'package.json'),'utf8'));
 if(pkg.name!=='@qloo/qloo-harness'||pkg.version!==lock.version)throw Error('CLI_VERSION');
 for(const [relative,expected] of Object.entries(lock.files)){
  if(!relative.startsWith('dist/')||relative.includes('..'))throw Error('CLI_LOCK');
  const actual=createHash('sha256').update(readFileSync(path.join(CLI_ROOT,relative))).digest('hex');
  if(actual!==expected)throw Error('CLI_CHANGED');
 }
 return {root:CLI_ROOT,version:lock.version,bin:path.join(CLI_ROOT,'dist/bin.js')};
}
export function credentialStatus(directory=QLOO_HOME_DIR){
 try{
  const dir=lstatSync(directory),file=lstatSync(path.join(directory,'config'));
  const owner=process.getuid?.();
  if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)||!file.isFile()||file.isSymbolicLink()||(file.mode&0o077)||file.size>8192||(owner!==undefined&&(file.uid!==owner||dir.uid!==owner)))return 'unsafe';
  // Only a readiness boolean escapes this function, never the credential value.
  const text=readFileSync(path.join(directory,'config'),'utf8');
  return /^api_key=[\x21-\x7e]{8,4096}\n$/.test(text)?'saved-unverified':'unsafe';
 }catch(error){return error.code==='ENOENT'?'missing':'unsafe';}
}
