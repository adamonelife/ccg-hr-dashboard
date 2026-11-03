import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
for(const size of [16,32])test(`People ${size}px favicon preserves the canonical silhouette and uses electric purple`,async()=>{
 const root=new URL('../public/brand/favicon/',import.meta.url);
 const png=await readFile(new URL(`people-${size}.png`,root));
 const source=JSON.parse(await readFile(new URL(`source-${size}.json`,root),'utf8'));
 assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
 const chunks=[];for(let pos=8;pos<png.length;){const n=png.readUInt32BE(pos);if(png.toString('ascii',pos+4,pos+8)==='IDAT')chunks.push(png.subarray(pos+8,pos+8+n));pos+=12+n;}
 const raw=inflateSync(Buffer.concat(chunks)),alpha=[];
 for(let y=0;y<size;y++){
  assert.equal(raw[y*(1+size*4)],0);
  for(let x=0;x<size;x++){
   const p=y*(1+size*4)+1+x*4;assert.deepEqual([...raw.subarray(p,p+3)],[139,92,246]);alpha.push(raw[p+3]);
  }
 }
 assert.equal(createHash('sha256').update(Buffer.from(alpha)).digest('hex'),source.alphaSha256);
 assert.deepEqual(source.dimensions,[size,size]);
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert(html.includes(`sizes="${size}x${size}" href="/brand/favicon/people-${size}.png"`));
});
