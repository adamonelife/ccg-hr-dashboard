// Disables only the seven explicitly approved disposable hosted QA identities.
import assert from 'node:assert/strict';
import {sql,load,save,protectedSnapshot,branch} from './hosted-common.mjs';
import {cleanupPeopleContexts} from '../db/cleanup-people-contexts.mjs';
const f=await load('fixtures-private.json'),users=Object.values(f.users),ids=users.map(u=>u.id),employees=users.map(u=>u.employeeId);
assert.equal(users.length,7);assert(users.every(u=>u.employeeId.startsWith('QA-PPL-'+f.suffix+'-')&&u.email.endsWith('@example.invalid')));
for(const u of users){const r=await fetch(branch.SUPABASE_URL+'/auth/v1/admin/users/'+u.id,{method:'PUT',headers:{apikey:branch.SUPABASE_SERVICE_ROLE_KEY,authorization:'Bearer '+branch.SUPABASE_SERVICE_ROLE_KEY,'content-type':'application/json'},body:JSON.stringify({ban_duration:'876000h'})});assert(r.ok,'Synthetic Auth ban failed');}
const[registry]=await load('registry-before.json');
await sql.begin(async tx=>{
 await tx`DELETE FROM auth.sessions WHERE user_id=ANY(${ids})`;
 await tx`UPDATE platform.module_access SET active=false WHERE user_id=ANY(${ids})`;
 await tx`UPDATE platform.memberships SET active=false WHERE user_id=ANY(${ids})`;
 await tx`UPDATE platform.people_identity_bindings SET review_status='revoked',approval_reference='Synthetic hosted QA completed; entry disabled' WHERE auth_user_id=ANY(${ids})`;
 await tx`UPDATE platform.people_auth_contexts SET revoked_at=now() WHERE auth_user_id=ANY(${ids})`;
 await tx`UPDATE platform.people_handoff_requests SET expires_at=now()-interval '1 second',encrypted_token=NULL WHERE auth_user_id=ANY(${ids})`;
 await tx`DELETE FROM employees WHERE employee_id=ANY(${employees})`;
 await tx`DELETE FROM org_units WHERE unit_name=${'People QA Team '+f.suffix}`;
 await tx`UPDATE platform.module_registry SET display_name=${registry.display_name},colour=${registry.colour},lifecycle=${registry.lifecycle},launch_url=${registry.launch_url},updated_at=${registry.updated_at} WHERE module='hr'`;
});
await cleanupPeopleContexts(sql);
const after=await protectedSnapshot(),before=await load('protected-before.json');assert.deepEqual(after,before,'Existing Projects/Integrations records changed');
const [counts]=await sql`SELECT (SELECT count(*)::int FROM employees WHERE employee_id=ANY(${employees})) employees,(SELECT count(*)::int FROM auth.sessions WHERE user_id=ANY(${ids})) provider_sessions,(SELECT count(*)::int FROM platform.module_access WHERE user_id=ANY(${ids}) AND active) active_grants,(SELECT count(*)::int FROM platform.people_identity_bindings WHERE auth_user_id=ANY(${ids}) AND review_status='approved') approved_bindings,(SELECT count(*)::int FROM platform.people_binding_audit WHERE auth_user_id=ANY(${ids})) retained_audit`;
const result={...counts,syntheticAuthUsersBanned:7,registryRestored:true,protectedSchemasUnchanged:true,verifiedAt:new Date().toISOString()};assert.equal(counts.employees+counts.provider_sessions+counts.active_grants+counts.approved_bindings,0);assert(counts.retained_audit>0);await save('cleanup-result.json',result);console.log(result);await sql.end();
