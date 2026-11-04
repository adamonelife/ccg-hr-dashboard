import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import{execFileSync}from'node:child_process';
import {prepareStaffAccess}from'../integrations/staff-access/prepare-source.mjs';
const source='/Users/adambeadle/Documents/ChatGPT/Nallin/nallin-access-picker',dest=path.resolve('work/hosted-qa/access-source');
const hash=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const snapshot=await prepareStaffAccess(source,dest,await hash(source+'/api/index.js'),await hash(source+'/lib/nallin-visual.cjs'));
await fs.cp(source+'/public',dest+'/public',{recursive:true});await fs.copyFile(source+'/vercel.json',dest+'/vercel.json');await fs.writeFile(dest+'/package.json',JSON.stringify({name:'people-access-hosted-qa',private:true,type:'commonjs',dependencies:{'@vercel/oidc':'4.0.6'}}));
const peopleFiles=execFileSync('git',['ls-files','-z','api','lib','src','shared','public','package.json','package-lock.json','index.html','vite.config.js','vercel.json'],{encoding:'utf8'}).split('\0').filter(file=>file&&file!=='src/public/ccglogo.png');
async function filesFrom(root,names){return Promise.all(names.map(async file=>{const body=await fs.readFile(path.join(root,file));return{file,sha:crypto.createHash('sha1').update(body).digest('hex'),size:body.length,base64:body.toString('base64')};}));}
async function walk(p,prefix=''){const out=[];for(const d of await fs.readdir(p,{withFileTypes:true})){const n=prefix+d.name;if(d.isDirectory())out.push(...await walk(path.join(p,d.name),n+'/'));else out.push(n);}return out;}
await fs.writeFile('work/hosted-qa/people-files.json',JSON.stringify(await filesFrom(process.cwd(),peopleFiles)));await fs.writeFile('work/hosted-qa/access-files.json',JSON.stringify(await filesFrom(dest,await walk(dest))));
await fs.writeFile('work/hosted-qa/source-snapshot.json',JSON.stringify(snapshot,null,2));console.log('Prepared source-only manifests:',peopleFiles.length,'People files; canonical API/launcher snapshot:',snapshot);
