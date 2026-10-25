import {readFileSync} from 'node:fs';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function triple(value) {
  if (typeof value !== 'string' || !SEMVER.test(value)) throw Error(`Invalid x.y.z version: ${value}`);
  const components = value.split('.').map(Number);
  if (components.some(n => n > 65535)) throw Error(`Chrome manifest version component exceeds 65535: ${value}`);
  return components;
}
export function versionCompare(left,right) {
  const a=triple(left), b=triple(right);
  for(let i=0;i<3;i++) if(a[i]!==b[i]) return Math.sign(a[i]-b[i]);
  return 0;
}
export function loadVersionConfig(root='.') {
  const config = JSON.parse(readFileSync(`${root}/config/version.json`, 'utf8'));
  if(config.schema!==1 || !['dev','release'].includes(config.channel)) throw Error('Invalid config/version.json schema or channel');
  triple(config.baseline);triple(config.nextRelease);
  if(versionCompare(config.nextRelease,config.baseline)<=0) throw Error('nextRelease must be newer than baseline');
  if(!Number.isInteger(config.devBuild) || config.devBuild<1 || config.devBuild>65535) throw Error('devBuild must be an integer 1..65535');
  return config;
}
export function resolveVersion(config,channel,build=config.devBuild) {
  if(!Number.isInteger(build) || build<1 || build>65535) throw Error('dev build must be in 1..65535');
  if(channel==='dev') return {
    manifestVersion:`${config.baseline}.${build}`,
    versionName:`${config.nextRelease}-dev.${build}`,
    artifactVersion:`v${config.nextRelease}-dev.${build}`
  };
  if(channel==='release') return {
    manifestVersion:config.nextRelease,
    versionName:config.nextRelease,
    artifactVersion:`v${config.nextRelease}`
  };
  throw Error(`Unknown channel ${channel}`);
}
export function verifySourceVersions(root,config) {
  const pkg=JSON.parse(readFileSync(`${root}/package.json`,'utf8'));
  const manifest=JSON.parse(readFileSync(`${root}/manifest.json`,'utf8'));
  const mode=resolveVersion(config,config.channel);
  if(pkg.version!==mode.versionName || manifest.version!==mode.manifestVersion ||
     manifest.version_name!==mode.versionName) {
    throw Error(`Version disagreement: package=${pkg.version} manifest=${manifest.version}/${manifest.version_name}, expected ${mode.manifestVersion}/${mode.versionName}`);
  }
}
