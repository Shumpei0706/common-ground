// Only the typed public entity IDs cross this isolated process boundary.
import {pathToFileURL} from 'node:url';
import {materialRequest,parseMaterial} from './material-query.mjs';
import {verifyInstallation,credentialStatus,OFFICIAL_ORIGIN} from './qloo-installation.mjs';
try{
 const plan=materialRequest(JSON.parse(process.argv[2])),installation=verifyInstallation();if(plan.requestHash!==process.env.CG_QLOO_REQUEST_HASH||credentialStatus(process.env.QLOO_HOME)!=='saved-unverified')throw Error('SCOPE');
 const {QlooClient,resolveQlooClientConfiguration}=await import(pathToFileURL(installation.root+'/dist/chunks/chunk-ESNY4EJL.js').href),config=resolveQlooClientConfiguration();if(config.apiKeySource!=='config'||config.baseUrl!==OFFICIAL_ORIGIN||!config.baseUrlTrusted)throw Error('CONFIG');
 const client=new QlooClient({apiKey:config.apiKey,baseUrl:OFFICIAL_ORIGIN,allowCustomBaseUrl:true,maxAttempts:1,timeoutMs:7500,maxResponseBytes:1048576});
 const d=await client.insights(plan.params);
 // Drop unrelated upstream properties and never serialize errors or credentials.
 const tag=t=>({tag_id:t.tag_id,name:t.name,types:t.types,subtype:t.subtype,tag_value:t.tag_value,query:t.query});
 const result={success:d?.success,results:{...(Array.isArray(d?.results?.tags)?{tags:d.results.tags.map(tag)}:{}),...(Array.isArray(d?.results?.entities)?{entities:d.results.entities.map(e=>({entity_id:e.entity_id,name:e.name,subtype:e.subtype,tags:Array.isArray(e.tags)?e.tags.slice(0,100).map(tag):undefined,query:{affinity:e.query?.affinity,explainability:e.query?.explainability},properties:{release_year:e.properties?.release_year,description:typeof e.properties?.description==='string'?e.properties.description.slice(0,2000):undefined}}))}:{})},query:{explainability:d?.query?.explainability}};
 const body=JSON.stringify(result);parseMaterial(body,plan.query);process.stdout.write(body);
}catch{process.stderr.write('QLOO_MATERIAL_FAILED\n');process.exitCode=1;}
