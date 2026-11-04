// Operator-only synthetic setup for the explicitly approved existing preview.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {branch,sql,save,dir} from './hosted-common.mjs';
import {hashPassword} from '../lib/passwords.mjs';
try{await fs.access(new URL('fixtures-private.json',dir));throw new Error('Fixtures already exist; do not recreate');}catch(e){if(e.code!=='ENOENT')throw e;}
const orgA=crypto.randomUUID(),orgB=crypto.randomUUID(),suffix=crypto.randomBytes(4).toString('hex');
const cases=[['manager','Director','reviewer',orgA],['lead','Team Lead','reviewer',orgA],['self','Employee','reviewer',orgA],['executive','Director','executive',orgA],['admin','Administrator','reviewer',orgA],['other_org','Employee','reviewer',orgB],['no_grant','Employee','reviewer',orgA]];
const users={};
for(const[name,role,membership,org]of cases){
 const password=crypto.randomBytes(24).toString('base64url'),email=`people-${name}-${suffix}@example.invalid`;
 const response=await fetch(branch.SUPABASE_URL+'/auth/v1/admin/users',{method:'POST',headers:{apikey:branch.SUPABASE_SERVICE_ROLE_KEY,authorization:'Bearer '+branch.SUPABASE_SERVICE_ROLE_KEY,'content-type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
 const user=await response.json();if(!response.ok||!user.id)throw new Error('Synthetic Auth fixture creation failed: '+response.status);
 users[name]={id:user.id,email,password,role,membership,org,employeeId:`QA-PPL-${suffix}-${name}`,internalId:`usr_people_${suffix}_${name}`};
 await save('fixtures-private.json',{orgA,orgB,suffix,users,partial:true});
}
await sql.begin(async tx=>{
 for(const[id,name]of[[orgA,'People Synthetic A'],[orgB,'People Synthetic B']])await tx`INSERT INTO platform.organisations(id,slug,name,kind) VALUES(${id},${'people-qa-'+suffix+'-'+name.slice(-1).toLowerCase()},${name},'concepts_conveyed')`;
 for(const u of Object.values(users)){
  await tx`INSERT INTO platform.identities(user_id,display_name) VALUES(${u.id},${'People QA '+u.employeeId.split('-').at(-1)})`;
  await tx`INSERT INTO platform.memberships(organisation_id,user_id,role) VALUES(${u.org},${u.id},${u.membership})`;
  await tx`INSERT INTO platform.internal_identity_bindings(auth_user_id,internal_user_id,organisation_id,bound_by) VALUES(${u.id},${u.internalId},${u.org},${users.admin.id})`;
  await tx`INSERT INTO public.employees(employee_id,full_name,nickname,job_title,permission_role,employment_status,profile_setup_completed_at,current_salary,salary_currency) VALUES(${u.employeeId},${'People QA '+u.employeeId.split('-').at(-1)},${'QA '+u.employeeId.split('-').at(-1)},'Synthetic QA record',${u.role},'Active',now(),100,'IDR')`;
  await tx`INSERT INTO public.user_accounts(employee_id,email,password_hash) VALUES(${u.employeeId},${u.email},${hashPassword(u.password)})`;
  await tx`INSERT INTO platform.people_identity_bindings(auth_user_id,organisation_id,employee_id,review_status,reviewed_by,reviewed_at,approval_reference,changed_by,managed_legacy) VALUES(${u.id},${u.org},${u.employeeId},'approved',${users.admin.id},now(),'Explicit existing-preview synthetic QA approval 2026-11-04',${users.admin.id},true)`;
  if(u!==users.no_grant)await tx`INSERT INTO platform.module_access(organisation_id,user_id,module,module_role,access_level,granted_by) VALUES(${u.org},${u.id},'hr','people','ADMIN',${users.admin.id})`;
 }
 await tx`INSERT INTO org_units(unit_name,unit_type,lead_employee_id) VALUES(${'People QA Team '+suffix},'Team',${users.lead.employeeId})`;
 await tx`UPDATE employees SET manager_id=${users.lead.employeeId},team=${'People QA Team '+suffix} WHERE employee_id=${users.self.employeeId}`;
 await tx`UPDATE platform.module_registry SET lifecycle='active' WHERE module='hr'`;
});
const cfg={PEOPLE_STAFF_ACCESS_ENABLED:'true',PEOPLE_PLATFORM_ENFORCEMENT_ENABLED:'true',PEOPLE_STAFF_ACCESS_ENVIRONMENT:'preview',PEOPLE_STAFF_ACCESS_ORGANISATION_ID:orgA,PEOPLE_STAFF_ACCESS_ORIGIN:'https://nallin-people-hosted-qa.vercel.app',PEOPLE_STAFF_ACCESS_ISSUER_ORIGIN:'https://nallin-access-people-hosted-qa.vercel.app',PEOPLE_STAFF_ACCESS_COHORT_IDS:Object.values(users).map(u=>u.id).join(','),PEOPLE_CONTEXT_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),PEOPLE_BROKER_SECRET:crypto.randomBytes(48).toString('base64url'),PEOPLE_PLATFORM_URL:branch.SUPABASE_URL,PEOPLE_PLATFORM_PUBLISHABLE_KEY:branch.SUPABASE_PUBLISHABLE_KEY||branch.SUPABASE_ANON_KEY,DATABASE_URL:branch.POSTGRES_URL,SESSION_SECRET:crypto.randomBytes(48).toString('base64url'),ADMIN_PASSWORD:crypto.randomBytes(48).toString('base64url')};
await save('fixtures-private.json',{orgA,orgB,suffix,users,partial:false});await save('people-env-private.json',cfg);
await save('access-env-private.json',{PEOPLE_STAFF_ACCESS_ENABLED:'true',PEOPLE_BROKER_SECRET:cfg.PEOPLE_BROKER_SECRET,NALLIN_PEOPLE_URL:cfg.PEOPLE_STAFF_ACCESS_ORIGIN,NEXT_PUBLIC_SUPABASE_URL:branch.SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:cfg.PEOPLE_PLATFORM_PUBLISHABLE_KEY});
console.log('Prepared seven synthetic identities, two organisations and preview-only configuration; no credentials displayed.');
await sql.end();
