import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';

// Exact public exports only. Editing files, narration sources and logs stay private.
export const onboardingRoot='./.common-ground/onboarding-video/exports';
const files=new Map([['intro-ja.mp4','video/mp4'],['intro-en.mp4','video/mp4'],['intro-poster.jpg','image/jpeg'],['intro-ja.vtt','text/vtt; charset=utf-8'],['intro-en.vtt','text/vtt; charset=utf-8']]);
export async function onboardingMedia(req,res,url,root=onboardingRoot){
 if(!url.pathname.startsWith('/onboarding/'))return false;
 const name=url.pathname.slice('/onboarding/'.length),type=files.get(name);
 const empty=(status,headers={})=>{res.writeHead(status,{'Cache-Control':'no-store',...headers});res.end();return true;};
 if(!type)return empty(404);
 if(!['GET','HEAD'].includes(req.method))return empty(405,{Allow:'GET, HEAD'});
 const file=path.join(root,name);let size;
 try{const info=await stat(file);if(!info.isFile())return empty(404);size=info.size;}catch{return empty(404);}
 let start=0,end=size-1,status=200;
 if(req.headers.range){
  const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if(!match||(!match[1]&&!match[2]))return empty(416,{'Content-Range':`bytes */${size}`});
  if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return empty(416,{'Content-Range':`bytes */${size}`});start=Math.max(0,size-suffix);}
  else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):end;}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size)return empty(416,{'Content-Range':`bytes */${size}`});
  status=206;
 }
 const headers={'Content-Type':type,'Content-Length':Math.max(0,end-start+1),'Accept-Ranges':'bytes','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};
 if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 res.writeHead(status,headers);
 if(req.method==='HEAD'||!size){res.end();return true;}
 const stream=createReadStream(file,{start,end});
 stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return true;
}
