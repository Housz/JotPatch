/** Small deterministic ZIP archive writer (PKZIP with DEFLATE, no third-party dependencies).
 * Designed for tiny extension assets; rejects unsafe/oversized paths and Zip64 input. */
import {deflateRawSync} from 'node:zlib';

const CRC_TABLE=Uint32Array.from({length:256},(_,index)=>{
  let c=index;
  for(let bit=0;bit<8;bit++) c=(c & 1)?((c>>>1)^0xedb88320):(c>>>1);
  return c>>>0;
});
export function crc32(buffer) {
  let crc=0xffffffff;
  for (const byte of buffer) crc=CRC_TABLE[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
const u16=(n)=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
const u32=(n)=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
export function zip(entries) {
  if(!Array.isArray(entries)||!entries.length||entries.length>65535)throw Error('Invalid ZIP file count');
  const local=[],central=[];let offset=0;
  const seen=new Set();
  for(const {name,data} of [...entries].sort((a,b)=>a.name.localeCompare(b.name,'en'))){
    if(!name || name.startsWith('/') || name.includes('\\') || name.split('/').some(x=>x==='..'||x==='.') || seen.has(name))
      throw Error(`Unsafe or duplicate archive path: ${name}`);
    seen.add(name);
    const filename=Buffer.from(name,'utf8');
    const plain=Buffer.from(data);
    const encoded=deflateRawSync(plain,{level:9});
    if(filename.length>65535 || plain.length>0xffffffff || encoded.length>0xffffffff || offset>0xffffffff)
      throw Error('ZIP entry too large');
    const crc=crc32(plain);
    // Fixed DOS datetime: 1980-01-01 00:00:00 (bit-for-bit reproducible).
    const flags=0x800; // UTF-8 filename
    const localRecord=Buffer.concat([
      u32(0x04034b50),u16(20),u16(flags),u16(8),u16(0),u16(33),
      u32(crc),u32(encoded.length),u32(plain.length),u16(filename.length),u16(0),filename,encoded]);
    local.push(localRecord);
    central.push(Buffer.concat([
      u32(0x02014b50),u16(20),u16(20),u16(flags),u16(8),u16(0),u16(33),
      u32(crc),u32(encoded.length),u32(plain.length),u16(filename.length),
      u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),filename]));
    offset+=localRecord.length;
  }
  const directory=Buffer.concat(central);
  if(offset>0xffffffff || directory.length>0xffffffff) throw Error('ZIP64 not supported');
  const end=Buffer.concat([u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),
    u32(directory.length),u32(offset),u16(0)]);
  return Buffer.concat([...local,directory,end]);
}
