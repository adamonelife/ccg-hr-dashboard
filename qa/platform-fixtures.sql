-- Synthetic fixtures only; never apply to a hosted environment.
CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA platform;
 CREATE TABLE auth.users(id uuid primary key);CREATE TABLE auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
 CREATE TABLE platform.organisations(id uuid primary key);CREATE TABLE platform.memberships(organisation_id uuid,user_id uuid,active boolean,UNIQUE(organisation_id,user_id));
 CREATE TABLE platform.internal_identity_bindings(auth_user_id uuid primary key,organisation_id uuid,internal_user_id text);
 CREATE TABLE platform.account_controls(user_id uuid primary key,status text);
 CREATE TABLE platform.module_access(user_id uuid,organisation_id uuid,module text,access_level text,module_role text,active boolean);
 CREATE TABLE platform.module_registry(module text primary key,lifecycle text);
 INSERT INTO auth.users VALUES('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');INSERT INTO auth.sessions VALUES('10000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000001',NULL);
 INSERT INTO platform.organisations VALUES('10000000-0000-4000-8000-000000000010');INSERT INTO platform.memberships VALUES('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001',true);
 INSERT INTO platform.internal_identity_bindings VALUES('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000010','usr_qa_one');INSERT INTO platform.account_controls VALUES('10000000-0000-4000-8000-000000000001','active');
 INSERT INTO platform.module_registry VALUES('hr','active');INSERT INTO platform.module_access VALUES('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000010','hr','STANDARD','people',true);
 INSERT INTO employees(employee_id,full_name,permission_role,employment_status,profile_setup_completed_at) VALUES('QA-ONE','QA employee','Director','Active',now()),('QA-OTHER','Other fixture','Employee','Active',now());
 INSERT INTO user_accounts(employee_id,email,password_hash) VALUES('QA-ONE','qa@example.invalid','fixture-account-initialised'),('QA-OTHER','other@example.invalid','fixture-account-initialised');
