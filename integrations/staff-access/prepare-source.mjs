// Prepare an isolated copy only. Never edits a deployed or shared source tree.
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { resolve } from "node:path";
import crypto from "node:crypto";
export async function prepareStaffAccess(
  source,
  destination,
  expectedSha256,
  expectedVisualSha256,
) {
  source = resolve(source);
  destination = resolve(destination);
  if (
    source === destination ||
    source.startsWith(destination + "/") ||
    destination.startsWith(source + "/")
  )
    throw new Error("Separate destination required");
  const api = await readFile(source + "/api/index.js", "utf8");
  let visual = await readFile(source + "/lib/nallin-visual.cjs", "utf8");
  if (
    !/^[a-f0-9]{64}$/.test(expectedSha256 || "") ||
    crypto.createHash("sha256").update(api).digest("hex") !== expectedSha256 ||
    !/^[a-f0-9]{64}$/.test(expectedVisualSha256 || "") ||
    crypto.createHash("sha256").update(visual).digest("hex") !==
      expectedVisualSha256
  )
    throw new Error("Staff Access source revision changed");
  let patched = api;
  const replace = (a, b) => {
    if (!patched.includes(a))
      throw new Error("Staff Access adapter anchor changed");
    patched = patched.replace(a, b);
  };
  replace(
    "const SECRET=()=>process.env.NALLIN_SSO_SECRET;",
    `const SECRET=()=>process.env.NALLIN_SSO_SECRET;
const peopleEnabled=()=>process.env.PEOPLE_STAFF_ACCESS_ENABLED==='true';
const activeModules=()=>[...MODULES,...(peopleEnabled()?['hr']:[])];
const peopleBroker=()=>import('../lib/people-broker.mjs').then(m=>m.createPeopleBroker({env:process.env}));`,
  );
  const old =
    "try{return await supabase('/functions/v1/nallin-staff-admin?scope=access',{headers:{Authorization:`Bearer ${session.accessToken}`,'x-region':'ap-northeast-2'}})}finally";
  replace(
    old,
    "try{let resolved;try{resolved=await supabase('/functions/v1/nallin-staff-admin?scope=access',{headers:{Authorization:`Bearer ${session.accessToken}`,'x-region':'ap-northeast-2'}});}catch(error){if(!peopleEnabled())throw error;const grant=await (await peopleBroker()).entitlement(session);if(!/^[0-9a-f-]{36}$/i.test(grant?.platformUserId||''))throw error;return{user:{id:grant.platformUserId,displayName:'Staff member'},entitlements:[grant]};}if(peopleEnabled()){const grant=await (await peopleBroker()).entitlement(session);if(grant)resolved.entitlements=[...resolved.entitlements.filter(x=>x.module!=='hr'),grant];}return resolved;}finally",
  );
  replace(
    "function handoff(res,session,resolved,module,returnTo){",
    "function handoff(res,session,resolved,module,returnTo,peopleState){if(module==='hr')return peopleBroker().then(b=>b.launch({...session,subject:resolved.user.id},{people_state:peopleState},res));",
  );
  patched = patched.replaceAll(
    "MODULES.includes(query.module)",
    "activeModules().includes(query.module)",
  );
  replace(
    "module:activeModules().includes(query.module)?query.module:null,",
    "module:activeModules().includes(query.module)?query.module:null,peopleState:/^[a-f0-9]{64}$/.test(query.people_state||'')?query.people_state:null,",
  );
  replace(
    "choice.module,query.return)",
    "choice.module,query.return,query.people_state)",
  );
  replace(
    "choice.module,state.returnTo)",
    "choice.module,state.returnTo,state.peopleState)",
  );
  await mkdir(destination + "/api", { recursive: true });
  await cp(source + "/lib", destination + "/lib", { recursive: true });
  await writeFile(destination + "/api/index.js", patched);
  await cp(
    new URL("./people-broker.mjs", import.meta.url),
    destination + "/lib/people-broker.mjs",
  );
  const visualPath = destination + "/lib/nallin-visual.cjs";
  const before =
    "const products=['operations','marketing','client_management'].filter";
  const replaceVisual = (a, b) => {
    if (!visual.includes(a))
      throw new Error("Staff Access launcher anchor changed");
    visual = visual.replace(a, b);
  };
  if (visual.includes(before)) {
    replaceVisual(
      before,
      "const products=['operations','marketing','client_management',...(process.env.PEOPLE_STAFF_ACCESS_ENABLED==='true'&&granted.has('hr')?['hr']:[])].filter",
    );
    replaceVisual(
      "+['hr','projects','integrations'].map",
      "+['hr','projects','integrations'].filter(key=>key!=='hr'||!(process.env.PEOPLE_STAFF_ACCESS_ENABLED==='true'&&granted.has('hr'))).map",
    );
  } else {
    replaceVisual(
      "moduleCard(key,modules[key].state==='COMING_SOON'?'COMING_SOON':'AVAILABLE')",
      "moduleCard(key,key==='hr'&&process.env.PEOPLE_STAFF_ACCESS_ENABLED==='true'&&granted.has('hr')?'AVAILABLE':modules[key].state==='COMING_SOON'?'COMING_SOON':'AVAILABLE')",
    );
  }
  replaceVisual(
    "if(state==='AVAILABLE'&&m.state==='COMING_SOON')",
    "if(state==='AVAILABLE'&&m.state==='COMING_SOON'&&!(key==='hr'&&process.env.PEOPLE_STAFF_ACCESS_ENABLED==='true'))",
  );
  await writeFile(visualPath, visual);
  return {
    sourceSha256: expectedSha256,
    visualSha256: expectedVisualSha256,
    productionChanged: false,
  };
}
