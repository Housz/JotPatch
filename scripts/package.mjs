import {readFileSync,writeFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {loadVersionConfig,resolveVersion,verifySourceVersions} from './versioning.mjs';
import {zip} from './zip.mjs';

const root=resolve(import.meta.dirname,'..');
const args=process.argv.slice(2);
const channel=args.find(x=>x.startsWith('--channel='))?.slice('--channel='.length);
const suppliedBuild=args.find(x=>x.startsWith('--build='))?.slice('--build='.length);
const build=suppliedBuild===undefined?undefined:Number(suppliedBuild);
if(args.some(x=>!x.startsWith('--channel=') && !x.startsWith('--build=')) || !['dev','release'].includes(channel) ||
  (suppliedBuild!==undefined && (!/^[1-9]\d*$/.test(suppliedBuild) || !Number.isInteger(build) || build>65535)) ||
  (channel==='release' && suppliedBuild!==undefined))
  throw Error('Usage: node scripts/package.mjs --channel=dev|release [--build=1..65535]');
const config=loadVersionConfig(root);
verifySourceVersions(root,config);
if(channel==='release' && config.channel!=='release')
  throw Error('Release builds must be prepared on a release PR: config/version.json channel=release and package/manifest versions updated');
const v=resolveVersion(config,channel,build);
const baseManifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
const manifest={...baseManifest,version:v.manifestVersion,version_name:v.versionName};
if(channel==='release') delete manifest.version_name;
const files=['dist/content.js','dist/background.js','options.html','options.js','styles/highlight.css',
  'icons/icon16.png','icons/icon32.png','icons/icon48.png','icons/icon128.png'];
const entries=[{name:'manifest.json',data:Buffer.from(JSON.stringify(manifest,null,2)+'\n')}];
const output=join(root,'build','chromium');
rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});
for(const name of files){
 const filepath=join(root,name);
 if(!existsSync(filepath)) throw Error(`Missing build input: ${name}`);
 const data=readFileSync(filepath);
 entries.push({name,data});
 mkdirSync(dirname(join(output,name)),{recursive:true});writeFileSync(join(output,name),data);
}
writeFileSync(join(output,'manifest.json'),entries[0].data);
const destination=join(root,'artifacts',`JotPatch-${v.artifactVersion}-chromium.zip`);
mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,zip(entries));
console.log(`Built ${destination} (${entries.length} files, manifest ${manifest.version}, displayed ${v.versionName})`);
