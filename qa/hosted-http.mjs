import crypto from 'node:crypto';
import{AsyncLocalStorage}from'node:async_hooks';
const machineContext=new AsyncLocalStorage();
export const withMachineToken=(token,fn)=>machineContext.run(token,fn);
export const currentMachineToken=()=>machineContext.getStore()||process.env.VERCEL_OIDC_TOKEN;
import {branch,load,sql} from './hosted-common.mjs';
export {branch,load,sql};
export const config=await load('people-env-private.json'),fixtures=await load('fixtures-private.json');
const links=await load('protection-links-private.json');
export const people=config.PEOPLE_STAFF_ACCESS_ORIGIN,access=config.PEOPLE_STAFF_ACCESS_ISSUER_ORIGIN;
export const cookieParts=response=>response.headers.getSetCookie().map(v=>v.split(';')[0]);
const transportOrigin=process.env.VERCEL_ENV==='preview'?people:new URL(links.people).origin;
export const protection={};
for(const kind of (process.env.VERCEL_ENV==='preview'?[]:['people'])){
 let url=links[kind],jar={};
 for(let i=0;i<5;i++){
  const r=await fetch(url,{redirect:'manual',headers:{cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; ')}});
  for(const part of cookieParts(r)){const n=part.indexOf('=');jar[part.slice(0,n)]=part.slice(n+1);}
  const location=r.headers.get('location');
  if(!location||!String(r.status).startsWith('3'))break;
  const next=new URL(location,url);if(next.origin!==new URL(links[kind]).origin)throw new Error('Preview protection access failed for '+kind);
  url=next.href;
 }
 protection[kind]=Object.entries(jar).map(([k,v])=>k+'='+v).join('; ');
 if(!protection[kind])throw new Error('No protected-preview cookie for '+kind);
}
export async function request(route,method='GET',body,cookie='',headers={}){
 const started=performance.now();const r=await fetch(transportOrigin+'/api/'+route,{method,redirect:'manual',headers:{...(currentMachineToken()?{'x-vercel-trusted-oidc-idp-token':currentMachineToken()}:{}),cookie:[protection.people,cookie].filter(Boolean).join('; '),origin:people,...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{}
 return{code:r.status,headers:r.headers,text,data,ms:performance.now()-started,cookie:cookieParts(r).join('; ')};
}
export async function signIn(name){const u=fixtures.users[name];const r=await fetch(branch.SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.PEOPLE_PLATFORM_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({email:u.email,password:u.password})});const data=await r.json();if(!r.ok||!data.access_token)throw new Error('Provider sign-in failed for '+name+': '+r.status);return data;}
export async function pending(name,session){
 const start=await request('nallin-sso/start');if(start.code!==303)throw new Error('Handoff start failed: '+start.code);
 const state=new URL(start.headers.get('location')).searchParams.get('people_state'),auth=session||await signIn(name);
 const body={state,subject:fixtures.users[name].id,accessToken:auth.access_token},timestamp=String(Math.floor(Date.now()/1000));
 const signature=crypto.createHmac('sha256',config.PEOPLE_BROKER_SECRET).update(timestamp+'\n'+JSON.stringify(body)).digest('hex');
 const issued=await request('nallin-sso/issue','POST',body,'',{'x-people-timestamp':timestamp,'x-people-signature':signature});
 return{start,state,auth,issued,nonceCookie:start.cookie};
}
export async function flow(name,oldCookie='',session){const p=await pending(name,session);if(p.issued.code!==200)throw new Error('Handoff issuance failed for '+name+': '+p.issued.code);const callback=await request('nallin-sso/callback','POST',p.issued.data,[p.nonceCookie,oldCookie].filter(Boolean).join('; '));return{...p,callback,cookie:callback.cookie};}
export function signedBrokerHeaders(body){const timestamp=String(Math.floor(Date.now()/1000));return{'x-people-timestamp':timestamp,'x-people-signature':crypto.createHmac('sha256',config.PEOPLE_BROKER_SECRET).update(timestamp+'\n'+JSON.stringify(body)).digest('hex')};}
