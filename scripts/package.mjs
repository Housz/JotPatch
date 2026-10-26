import {readFileSync,writeFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {loadVersionConfig,resolveVersion,verifySourceVersions} from './versioning.mjs';
import {buildFirefoxManifest} from './firefox-manifest.mjs';
import {zip} from './zip.mjs';

const root=resolve(import.meta.dirname,'..');
const args=process.argv.slice(2);
const flag=(name)=>args.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3);
const channel=flag('channel');
const browser=flag('browser')??'chromium';
const suppliedBuild=flag('build');
const build=suppliedBuild===undefined?undefined:Number(suppliedBuild);
if(args.some(x=>!x.startsWith('--channel=') && !x.startsWith('--build=') && !x.startsWith('--browser=')) ||
  !['dev','release'].includes(channel) || !['chromium','firefox'].includes(browser) ||
  (suppliedBuild!==undefined && (!/^[1-9]\d*$/.test(suppliedBuild) || !Number.isInteger(build) || build>65535)) ||
  (channel==='release' && suppliedBuild!==undefined))
  throw Error('Usage: node scripts/package.mjs --channel=dev|release [--browser=chromium|firefox] [--build=1..65535]');
const config=loadVersionConfig(root);
verifySourceVersions(root,config);
if(channel==='release' && config.channel!=='release')
  throw Error('Release builds must be prepared on a release PR: config/version.json channel=release and package/manifest versions updated');
const v=resolveVersion(config,channel,build);
const baseManifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
let manifest;
if(browser==='firefox'){
  // Gecko reads background.scripts + options_ui and rejects Chromium-only keys,
  // so the Firefox manifest is derived rather than copied.
  manifest=buildFirefoxManifest(baseManifest,v.manifestVersion);
}else{
  manifest={...baseManifest,version:v.manifestVersion,version_name:v.versionName};
  if(channel==='release') delete manifest.version_name;
}
const files=['dist/content.js','dist/background.js','options.html','options.js','styles/highlight.css',
  'icons/icon16.png','icons/icon32.png','icons/icon48.png','icons/icon128.png'];
const entries=[{name:'manifest.json',data:Buffer.from(JSON.stringify(manifest,null,2)+'\n')}];
const output=join(root,'build',browser);
rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});
for(const name of files){
 const filepath=join(root,name);
 if(!existsSync(filepath)) throw Error(`Missing build input: ${name}`);
 const data=readFileSync(filepath);
 entries.push({name,data});
 mkdirSync(dirname(join(output,name)),{recursive:true});writeFileSync(join(output,name),data);
}
writeFileSync(join(output,'manifest.json'),entries[0].data);
const destination=join(root,'artifacts',`JotPatch-${v.artifactVersion}-${browser}.zip`);
mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,zip(entries));
console.log(`Built ${destination} (${entries.length} files, ${browser} manifest ${manifest.version}, displayed ${v.versionName})`);
