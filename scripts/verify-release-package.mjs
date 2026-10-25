// Final archive gate, separate from TypeScript build and source version checks.
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {loadVersionConfig} from './versioning.mjs';
import {crc32} from './zip.mjs';

const config=loadVersionConfig();
if(config.channel!=='release') throw Error('Not in release channel');
const name=`artifacts/JotPatch-v${config.nextRelease}-chromium.zip`;
const bytes=readFileSync(name);
let offset=0;
const contents=new Map();
while(offset+30<=bytes.length && bytes.readUInt32LE(offset)===0x04034b50){
  const method=bytes.readUInt16LE(offset+8),crc=bytes.readUInt32LE(offset+14),
    compressed=bytes.readUInt32LE(offset+18),plain=bytes.readUInt32LE(offset+22),
    nlen=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28);
  const fname=bytes.toString('utf8',offset+30,offset+30+nlen),start=offset+30+nlen+extra;
  if(start+compressed>bytes.length || contents.has(fname))throw Error(`Invalid archive entry ${fname}`);
  const chunk=bytes.subarray(start,start+compressed);
  const data=method===0?chunk:method===8?inflateRawSync(chunk):null;
  if(!data || data.length!==plain || crc32(data)!==crc)throw Error(`Invalid archive payload ${fname}`);
  contents.set(fname,data);
  offset=start+compressed;
}
const allowed=['manifest.json','dist/content.js','dist/background.js','options.html','options.js',
  'styles/highlight.css','icons/icon16.png','icons/icon32.png','icons/icon48.png','icons/icon128.png'];
if(contents.size!==allowed.length || allowed.some(path=>!contents.has(path)) || [...contents.keys()].some(path=>!allowed.includes(path)))
  throw Error('Unexpected files in final installable archive');
const manifest=JSON.parse(contents.get('manifest.json'));
if(manifest.version!==config.nextRelease || manifest.version_name!==undefined || manifest.manifest_version!==3)
  throw Error('Published manifest version mismatch');
if(JSON.stringify(manifest.permissions)!==JSON.stringify(['activeTab','scripting','storage','contextMenus']))
  throw Error('Unexpected permissions in release');
for(const path of allowed.filter(path=>path!=='manifest.json')){
  if(contents.get(path).length===0)throw Error(`Empty release asset: ${path}`);
}
console.log(`Verified ${name}: ${contents.size} runtime files, manifest ${manifest.version}, no source files`);
