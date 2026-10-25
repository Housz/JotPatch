import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {loadVersionConfig,resolveVersion,triple,versionCompare,verifySourceVersions} from '../scripts/versioning.mjs';
import {crc32,zip} from '../scripts/zip.mjs';

test('development and release versions are compatible with Chrome numeric upgrade order',()=>{
  const config=loadVersionConfig();
  const dev=resolveVersion(config,'dev'),release=resolveVersion(config,'release');
  assert.equal(dev.versionName,`${config.nextRelease}-dev.${config.devBuild}`);
  assert.equal(dev.manifestVersion,`${config.baseline}.${config.devBuild}`);
  assert.equal(release.manifestVersion,config.nextRelease);
  assert.ok(versionCompare(config.nextRelease,config.baseline)>0);
  assert.ok(versionCompare(config.baseline,config.nextRelease)<0);
  verifySourceVersions('.',config);
  assert.equal(resolveVersion(config,'dev',8).manifestVersion,`${config.baseline}.8`);
  assert.throws(()=>resolveVersion(config,'dev',65536));
  for(const name of ['1.2.3-beta','1.2.3.4','1.02.3','1.2.65536']) assert.throws(()=>triple(name));
});
test('the Chromium dev archive contains a root manifest and no source files',()=>{
  const version=resolveVersion(loadVersionConfig(),'dev');
  const filename=`artifacts/JotPatch-${version.artifactVersion}-chromium.zip`;
  if(!existsSync(filename))return; // npm run check does not require packaging first.
  const binary=readFileSync(filename);
  const local=[];let offset=0;
  while(binary.readUInt32LE(offset)===0x04034b50){
    const method=binary.readUInt16LE(offset+8),crc=binary.readUInt32LE(offset+14),
      compressed=binary.readUInt32LE(offset+18),plain=binary.readUInt32LE(offset+22),
      nameLength=binary.readUInt16LE(offset+26),extra=binary.readUInt16LE(offset+28);
    const name=binary.toString('utf8',offset+30,offset+30+nameLength);
    const start=offset+30+nameLength+extra;
    const bytes=binary.subarray(start,start+compressed);
    const data=method===8?inflateRawSync(bytes):bytes;
    assert.equal(data.length,plain);assert.equal(crc32(data),crc);
    local.push({name,data});offset=start+compressed;
  }
  const names=local.map(x=>x.name);
  assert.ok(names.includes('manifest.json'));
  assert.ok(names.includes('dist/content.js'));
  assert.ok(names.includes('icons/icon128.png'));
  assert.ok(!names.some(x=>x.startsWith('src/')||x.includes('node_modules')||x.includes('README.md')));
  const manifest=JSON.parse(local.find(x=>x.name==='manifest.json').data);
  assert.equal(manifest.version,version.manifestVersion);
  assert.equal(manifest.version_name,version.versionName);
});
test('ZIP builder rejects unsafe/duplicate names and produces deterministic bytes',()=>{
  const entries=[{name:'manifest.json',data:Buffer.from('{}')},{name:'icons/icon16.png',data:Buffer.from('a')}];
  assert.ok(zip(entries).equals(zip([...entries].reverse())));
  assert.throws(()=>zip([{name:'../bad',data:Buffer.from('x')}]),/Unsafe/);
  assert.throws(()=>zip([entries[0],entries[0]]),/duplicate/);
});
