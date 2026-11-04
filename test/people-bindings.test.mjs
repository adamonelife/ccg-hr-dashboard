import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {database,sql,queries} from './database.mjs';
import {inspectPeopleBinding} from '../lib/people-binding-readiness.mjs';
const user='00000000-0000-4000-8000-000000000001', reviewer='00000000-0000-4000-8000-000000000002', other='00000000-0000-4000-8000-000000000003';
const org='00000000-0000-4000-8000-000000000010', otherOrg='00000000-0000-4000-8000-000000000011';
const migration=new URL('../supabase/migrations/20261104065230_people_reviewed_identity_bindings.sql',import.meta.url);
async function insert(status='approved',subject=user,employee='QA-001',organisation=org){
 await database.query(`INSERT INTO platform.people_identity_bindings(auth_user_id,organisation_id,employee_id,review_status,approval_reference,reviewed_by,reviewed_at,changed_by) VALUES ($1,$2,$3,$4,'isolated-fixture-review',$5,now(),$5)`,[subject,organisation,employee,status,reviewer]);
}
const inspect=(platformUserId=user,organisationId=org)=>inspectPeopleBinding(sql,{platformUserId,organisationId});
async function restore(){
 await database.exec(`UPDATE platform.people_identity_bindings SET review_status='approved',changed_by='${reviewer}' WHERE auth_user_id='${user}'; UPDATE platform.memberships SET active=true; UPDATE platform.account_controls SET status='active'; UPDATE employees SET employment_status='Active' WHERE employee_id='QA-001'; UPDATE user_accounts SET password_hash='synthetic-account-only-not-a-credential' WHERE employee_id='QA-001';`);
}
before(async()=>{
 await database.exec(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'));
 await database.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE SCHEMA platform;
 CREATE TABLE auth.users(id uuid primary key);
 CREATE TABLE platform.organisations(id uuid primary key);
 CREATE TABLE platform.memberships(organisation_id uuid references platform.organisations(id),user_id uuid references auth.users(id),active boolean NOT NULL,UNIQUE(organisation_id,user_id));
 CREATE TABLE platform.internal_identity_bindings(auth_user_id uuid primary key references auth.users(id),organisation_id uuid NOT NULL,internal_user_id text NOT NULL);
 CREATE TABLE platform.account_controls(user_id uuid primary key references auth.users(id),status text NOT NULL);
 INSERT INTO auth.users VALUES ('${user}'),('${reviewer}'),('${other}');
 INSERT INTO platform.organisations VALUES ('${org}'),('${otherOrg}');
 INSERT INTO platform.memberships VALUES ('${org}','${user}',true),('${org}','${reviewer}',true),('${org}','${other}',true),('${otherOrg}','${user}',true);
 INSERT INTO platform.internal_identity_bindings VALUES ('${user}','${org}','usr_qa_people_one');
 INSERT INTO platform.account_controls VALUES ('${user}','active');
 INSERT INTO employees(employee_id,full_name,permission_role,employment_status) VALUES ('QA-001','Synthetic fixture one','Director','Active'),('QA-002','Synthetic fixture two','Employee','Active');
 INSERT INTO user_accounts(employee_id,email,password_hash) VALUES ('QA-001','qa-one@example.invalid','synthetic-account-only-not-a-credential');`);
 const before=(await database.query('SELECT to_jsonb(e) AS e FROM employees e ORDER BY employee_id')).rows;
 await database.exec(await readFile(migration,'utf8'));
 assert.deepEqual((await database.query('SELECT to_jsonb(e) AS e FROM employees e ORDER BY employee_id')).rows,before);
});
after(async()=>database.close());
test('Optional migration seeds no live identities and preserves existing business records',async()=>{
 assert.equal((await database.query('SELECT count(*)::int n FROM platform.people_identity_bindings')).rows[0].n,0);
 assert.equal((await database.query('SELECT count(*)::int n FROM platform.people_binding_audit')).rows[0].n,0);
 assert.equal((await inspect()).status,'binding_missing');
});
test('Approved explicit binding resolves current People role without granting module entry',async()=>{
 await insert();const r=await inspect();assert.equal(r.status,'binding_ready');assert.equal(r.employeeId,'QA-001');assert.equal(r.peopleRole,'Director');assert.equal(r.profileSetupComplete,false);assert.equal(r.bindingVersion,'1');
 assert(!Object.hasOwn(r,'accessToken'));assert(!Object.hasOwn(r,'email'));assert(!Object.hasOwn(r,'authenticated'));
});
test('Duplicates cannot bind another identity to the same employee or the same identity to another employee',async()=>{
 await assert.rejects(insert('approved',other,'QA-001'));
 await assert.rejects(insert('approved',user,'QA-002'));
});
test('Unknown employee, platform identity and organisation membership fail database constraints',async()=>{
 await assert.rejects(insert('approved',other,'QA-MISSING'));
 await assert.rejects(insert('approved','00000000-0000-4000-8000-000000000099','QA-002'));
 await assert.rejects(insert('approved',other,'QA-002',otherOrg));
});
test('Approval requires reviewer, time and nonblank evidence',async()=>{
 for(const change of ["reviewed_by=NULL","reviewed_at=NULL","approval_reference=NULL","approval_reference=' '"]){
  await assert.rejects(database.exec(`UPDATE platform.people_identity_bindings SET ${change} WHERE auth_user_id='${user}'`));
 }
});
test('Pending and revoked bindings are denied even after a prior successful read',async()=>{
 for(const [status,expected] of [['pending','binding_review_required'],['revoked','binding_revoked']]){
  await database.query('UPDATE platform.people_identity_bindings SET review_status=$1 WHERE auth_user_id=$2',[status,user]);
  const r=await inspect();assert.equal(r.status,expected);assert.equal(r.readyForCertification,false);
 }
 await restore();assert.equal((await inspect()).status,'binding_ready');
});
test('Identity keys are immutable and deletion is refused',async()=>{
 for(const change of [`employee_id='QA-002'`,`auth_user_id='${other}'`,`organisation_id='${otherOrg}'`])await assert.rejects(database.exec(`UPDATE platform.people_identity_bindings SET ${change} WHERE auth_user_id='${user}'`));
 await assert.rejects(database.query('DELETE FROM platform.people_identity_bindings WHERE auth_user_id=$1',[user]));
});
test('Binding history is versioned and rolls back with its change',async()=>{
 const before=(await database.query('SELECT count(*)::int n FROM platform.people_binding_audit')).rows[0].n;
 const version=(await inspect()).bindingVersion;
 await database.exec('BEGIN');await database.query('UPDATE platform.people_identity_bindings SET review_status=$1 WHERE auth_user_id=$2',['revoked',user]);await database.exec('ROLLBACK');
 assert.equal((await inspect()).bindingVersion,version);assert.equal((await database.query('SELECT count(*)::int n FROM platform.people_binding_audit')).rows[0].n,before);
 const audit=(await database.query('SELECT * FROM platform.people_binding_audit ORDER BY id DESC LIMIT 1')).rows[0];assert.equal(audit.actor_user_id,reviewer);assert(audit.current_record.binding_version>1);
});
test('Cross-organisation request and changed internal platform binding are denied',async()=>{
 assert.equal((await inspect(user,otherOrg)).status,'binding_missing');
 await database.query('UPDATE platform.internal_identity_bindings SET organisation_id=$1 WHERE auth_user_id=$2',[otherOrg,user]);
 assert.equal((await inspect()).status,'platform_identity_ineligible');
 await database.query('UPDATE platform.internal_identity_bindings SET organisation_id=$1 WHERE auth_user_id=$2',[org,user]);
});
test('Disabled platform control and inactive membership are re-read without cross-request cache',async()=>{
 await database.query("UPDATE platform.account_controls SET status='disabled' WHERE user_id=$1",[user]);assert.equal((await inspect()).status,'platform_identity_ineligible');
 await restore();await database.query('UPDATE platform.memberships SET active=false WHERE user_id=$1',[user]);assert.equal((await inspect()).status,'platform_identity_ineligible');await restore();
});
test('Resigned and Terminated employees are denied; existing leave/notice semantics remain',async()=>{
 for(const status of ['Resigned','Terminated','On Leave','Notice Period']){
  await database.query('UPDATE employees SET employment_status=$1 WHERE employee_id=$2',[status,'QA-001']);
  assert.equal((await inspect()).status,['Resigned','Terminated'].includes(status)?'people_employee_ineligible':'binding_ready');
 }
 await restore();
});
test('Missing/non-initialised People account remains ineligible for first pilot',async()=>{
 await database.query('UPDATE user_accounts SET password_hash=NULL WHERE employee_id=$1',['QA-001']);assert.equal((await inspect()).status,'people_account_ineligible');await restore();
 await insert('approved',other,'QA-002');
 await database.query('INSERT INTO platform.internal_identity_bindings VALUES ($1,$2,$3)',[other,org,'usr_qa_people_two']);
 assert.equal((await inspect(other)).status,'people_account_ineligible');
});
test('Live People role and setup timestamp are preserved; platform roles are not translated',async()=>{
 await database.query("UPDATE employees SET permission_role='Employee',profile_setup_completed_at=now() WHERE employee_id=$1",['QA-001']);
 const r=await inspect();assert.equal(r.peopleRole,'Employee');assert.equal(r.profileSetupComplete,true);
});
test('Readiness inspector uses explicit minimal SELECT only and rejects email/name inputs before SQL',async()=>{
 let start=queries.length;assert.equal((await inspect('qa-one@example.invalid')).status,'invalid_identity');assert.equal(queries.length,start);
 start=queries.length;await inspect();assert(queries.slice(start).every(q=>/^\s*SELECT/.test(q)));assert(queries.slice(start).every(q=>!q.includes('current_salary')));
});
test('Browser database roles cannot read or change binding/audit tables; RLS stays enabled',async()=>{
 const r=(await database.query("SELECT relname,relrowsecurity FROM pg_class WHERE oid IN ('platform.people_identity_bindings'::regclass,'platform.people_binding_audit'::regclass)")).rows;
 assert(r.every(t=>t.relrowsecurity));
 for(const role of ['anon','authenticated']){
  await database.exec(`SET ROLE ${role}`);
  try{for(const table of ['people_identity_bindings','people_binding_audit'])await assert.rejects(database.query(`SELECT * FROM platform.${table}`));}
  finally{await database.exec('RESET ROLE');}
 }
 // Even accidental future SELECT grants must not expose rows without an RLS policy.
 await database.exec('GRANT USAGE ON SCHEMA platform TO authenticated; GRANT SELECT ON platform.people_identity_bindings TO authenticated; SET ROLE authenticated');
 try{assert.equal((await database.query('SELECT * FROM platform.people_identity_bindings')).rows.length,0);}finally{await database.exec('RESET ROLE');}
});
test('Binding preflight is read-only, detects browser exposure, and is separate from legacy schema checks',async()=>{
 const {verifyPeopleBindings}=await import('../db/verify-people-bindings.mjs');
 await assert.rejects(verifyPeopleBindings(sql),/server-only/);
 await database.exec('REVOKE SELECT ON platform.people_identity_bindings FROM authenticated');
 const start=queries.length;assert.deepEqual(await verifyPeopleBindings(sql),{ok:true,tables:2,seedsRequired:false,loginChanged:false});
 assert(queries.slice(start).every(q=>/^\s*SELECT/.test(q)));
 await database.exec('ALTER TABLE platform.people_identity_bindings DISABLE ROW LEVEL SECURITY');
 await assert.rejects(verifyPeopleBindings(sql),/RLS/);
 await database.exec('ALTER TABLE platform.people_identity_bindings ENABLE ROW LEVEL SECURITY');
});
