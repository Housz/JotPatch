// Release gate: BOTH browser archives must be structurally intact, versioned
// identically, and contain identical shared runtime code. Signing is separate.
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {loadVersionConfig} from './versioning.mjs';
import {crc32} from './zip.mjs';
import {verifyFirefoxManifest, FIREFOX_ADDON_ID} from './firefox-manifest.mjs';

const config=loadVersionConfig();
if(config.channel!=='release') throw Error('Not in release channel');
const expected=[
 'manifest.json','dist/content.js','dist/background.js','options.html','options.js',
 'styles/highlight.css','icons/icon16.png','icons/icon32.png','icons/icon48.png','icons/icon128.png'
].sort();
function inspect(browser) {
 const name=`artifacts/JotPatch-v${config.nextRelease}-${browser}.zip`;
 const bytes=readFileSync(name);
 let offset=0;
 const contents=new Map();
 while(offset+30<=bytes.length && bytes.readUInt32LE(offset)===0x04034b50){
   const method=bytes.readUInt16LE(offset+8),crc=bytes.readUInt32LE(offset+14),
    compressed=bytes.readUInt32LE(offset+18),plain=bytes.readUInt32LE(offset+22),
    nlen=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28);
   const fname=bytes.toString('utf8',offset+30,offset+30+nlen),start=offset+30+nlen+extra;
   if(start+compressed>bytes.length || contents.has(fname))throw Error(`Invalid ${browser} archive entry ${fname}`);
   const chunk=bytes.subarray(start,start+compressed);
   const data=method===0?chunk:method===8?inflateRawSync(chunk):null;
   if(!data || data.length!==plain || crc32(data)!==crc)throw Error(`Invalid ${browser} archive payload ${fname}`);
   contents.set(fname,data);
   offset=start+compressed;
 }
 if(JSON.stringify([...contents.keys()].sort())!==JSON.stringify(expected))
   throw Error(`Unexpected files in ${browser} archive`);
 for(const file of expected) if(!contents.get(file).length)throw Error(`Empty ${browser} asset: ${file}`);
 const manifest=JSON.parse(contents.get('manifest.json'));
 if(manifest.version!==config.nextRelease || manifest.version_name!==undefined || manifest.manifest_version!==3)
   throw Error(`${browser} published manifest version mismatch`);
 if(JSON.stringify(manifest.permissions)!==JSON.stringify(['activeTab','scripting','storage','contextMenus']))
   throw Error(`${browser} unexpected permissions`);
 if(manifest.host_permissions !== undefined)throw Error(`${browser} unexpectedly requests broad host_permissions`);
 if(browser==='firefox'){
   const problems=verifyFirefoxManifest(manifest);
   if(problems.length)throw Error(`Firefox manifest validation failed: ${problems.join('; ')}`);
   if(manifest.browser_specific_settings.gecko.id!==FIREFOX_ADDON_ID)
     throw Error('Firefox add-on identity changed');
 }else{
   if(manifest.background?.service_worker!=='dist/background.js' || manifest.browser_specific_settings)
     throw Error('Chromium service worker or vendor manifest mismatch');
 }
 console.log(`Verified ${name}: 10 runtime files, manifest ${manifest.version}`);
 return contents;
}
const chrome=inspect('chromium'),firefox=inspect('firefox');
for(const file of expected.filter(file=>file!=='manifest.json')) {
 if(!chrome.get(file).equals(firefox.get(file)))
   throw Error(`Cross-browser divergence in shared file ${file}`);
}
console.log('Verified shared runtime is byte-for-byte identical across Chromium/Firefox packages.');
