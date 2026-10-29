import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { database, sql, queries, failNext } from './database.mjs';
mock.module('postgres', { defaultExport: () => sql });
process.env.DATABASE_URL = 'postgres://isolated-memory-test/never-connected';
process.env.SESSION_SECRET = 'isolated-test-secret-not-production';
process.env.ADMIN_PASSWORD = 'isolated-bootstrap-not-production';
const { default: handler } = await import('../api/[[...path]].mjs');
const { createSessionToken } = await import('../lib/auth.mjs');
const { hashPassword } = await import('../lib/passwords.mjs');
const actors = { Administrator: null, Director: 'director', HR: 'hr', Finance: 'finance', 'Main Lead': 'mainlead', 'Team Lead': 'lead', Employee: 'employee' };
async function request(role, route, method = 'GET', body = undefined, employeeId = actors[role]) {
  const user = employeeId ? employeeId + '@example.invalid' : 'adam';
  const token = createSessionToken({ user, role, employee_id: employeeId });
  return requestCookie(token, route, method, body);
}
async function requestCookie(token, route, method='GET', body) {
  const u = new URL('/api/' + route, 'https://test.invalid');
  const req = { method, url: u.pathname + u.search, query: Object.fromEntries(u.searchParams),
    headers: { host: 'test.invalid', 'content-type': 'application/json', ...(token ? { cookie: 'hr_session=' + token } : {}) },
    async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); } };
  const res = { code: 200, headersSent: false, headers: {}, status(code) { this.code=code; return this; },
    json(data) { this.data=data;this.headersSent=true;return this; },setHeader(key,value){this.headers[key]=value;} };
  await handler(req,res);return res;
}
async function value(query, params=[]) { return (await database.query(query,params)).rows[0]; }
before(async () => {
  await database.exec(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'));
  await database.exec(`INSERT INTO org_units(unit_name,unit_type,parent_unit_name) VALUES ('Dept','Department',NULL),('Team','Team','Dept'),('Other','Team',NULL)`);
  const password=hashPassword('test-password');
  for (const [role,id] of Object.entries(actors)) {
    if (!id) continue;
    await sql`INSERT INTO employees (employee_id,full_name,email,permission_role,department,team,start_date,profile_setup_completed_at,current_salary,ktp_number,bni_account_number,phone)
      VALUES (${id},${id},${id+'@example.invalid'},${role},${id==='employee' || id==='lead'?'Dept':null},${id==='employee' || id==='lead'?'Team':'Other'},'2020-01-01',now(),100,'secret-id','secret-bank','secret-phone')`;
    await sql`INSERT INTO user_accounts(employee_id,email,password_hash) VALUES(${id},${id+'@example.invalid'},${password})`;
  }
  await database.exec(`INSERT INTO employees(employee_id,full_name,permission_role,team,start_date,profile_setup_completed_at) VALUES ('outside','Outside','Employee','Other','2020-01-01',now()),('fresh','Fresh','Employee','Team','2020-01-01',NULL),('admin-target','Admin','Administrator','Other','2020-01-01',now());
    UPDATE org_units SET lead_employee_id='lead' WHERE unit_name='Team';
    UPDATE org_units SET lead_employee_id='mainlead' WHERE unit_name='Dept';`);
  await sql`INSERT INTO user_accounts(employee_id,email,password_hash) VALUES('fresh','fresh@example.invalid',${password})`;
  for (const id of ['employee','director','hr','finance','outside']) {
    await sql`INSERT INTO documents(employee_id,document_type,drive_link) VALUES(${id},'Other','https://drive.google.com/test')`;
    await sql`INSERT INTO skills(employee_id,category,item,level) VALUES(${id},'Software Skill','Fixture skill','3')`;
    await sql`INSERT INTO salary_history(employee_id,effective_date,amount) VALUES(${id},'2026-01-01',100)`;
    await sql`INSERT INTO promotion_history(employee_id,promotion_date,new_title) VALUES(${id},'2026-01-01','Fixture title')`;
  }
});
after(async()=>{await database.close();});
for (const role of Object.keys(actors)) {
  test(role+' Directory uses only summary fields',async()=>{
    const r=await request(role,'employees');assert.equal(r.code,200,JSON.stringify(r.data));
    const allowed=['employee_id','full_name','nickname','job_title','department','team','employment_status','can_view_detail',...(['Administrator','Director','HR','Finance'].includes(role)?['start_date']:[])];
    for (const row of r.data.employees) assert.deepEqual(Object.keys(row).sort(),allowed.sort());
    assert(!JSON.stringify(r.data).includes('secret-'));
  });
  test(role+' unauthenticated counterpart is denied',async()=>assert.equal((await requestCookie(null,'employees')).code,401));
}
const viewCases=[['Employee','employee',200],['Employee','outside',403],['Team Lead','employee',200],['Main Lead','employee',200],['Team Lead','outside',403],['HR','employee',200],['HR','director',403],['Finance','admin-target',403],['Director','director',200],['Administrator','admin-target',200]];
for(const [role,id,status]of viewCases)test(`${role} view ${id}: ${status}`,async()=>assert.equal((await request(role,'employees?id='+id)).code,status));
for(const role of ['Team Lead','Main Lead','Employee']) {
  for(const field of ['current_salary','salary_currency','bonus_eligible','permission_role','employment_status','ktp_number','bni_account_number','full_name','department']) {
    test(`${role} cannot change protected ${field}`,async()=>assert.equal((await request(role,'employees','PATCH',{employee_id:'employee',[field]:field==='current_salary'?999:'Administrator'})).code,403));
  }
}
for(const role of ['Director','HR','Finance']) {
 test(role+' cannot assign privilege by create or PATCH',async()=>{
   assert.equal((await request(role,'employees','POST',{employee_id:'bad-'+role,full_name:'bad',permission_role:'Administrator'})).code,403);
   assert.equal((await request(role,'employees','PATCH',{employee_id:actors[role],permission_role:'Administrator'})).code,403);
 });
 test(role+' can create ordinary employees and edit employment/compensation',async()=>{
   const id='created-'+role;
   assert.equal((await request(role,'employees','POST',{employee_id:id,full_name:'Fixture'})).code,201);
   assert.equal((await request(role,'employees','PATCH',{employee_id:id,job_title:'Updated',current_salary:250,bonus_eligible:'TRUE'})).code,200);
   assert.equal((await value('SELECT bonus_eligible FROM employees WHERE employee_id=$1',[id])).bonus_eligible,true);
 });
}
test('Administrator can manage roles, and deletion remains Administrator-only',async()=>{
 assert.equal((await request('Administrator','employees','PATCH',{employee_id:'outside',permission_role:'Team Lead'})).code,200);
 assert.equal((await request('HR','employees?id=outside','DELETE')).code,403);
 assert.equal((await request('Administrator','employees','PATCH',{employee_id:'outside',permission_role:'Employee'})).code,200);
});
test('Lead profile is read-only but subordinate skills remain editable',async()=>{
 const r=await request('Team Lead','employees?id=employee');assert.deepEqual(r.data.permissions.editable_fields,[]);
 assert.equal((await request('Team Lead','employees','PATCH',{employee_id:'employee',nickname:'not permitted'})).code,403);
 assert.equal((await request('Team Lead','skills','POST',{employee_id:'employee',category:'Technical Skill',item:'Lead assessment',level:'4'})).code,201);
});
test('Initial setup saves directly; later changes require approval',async()=>{
 let r=await request('Employee','employees','PATCH',{employee_id:'fresh',nickname:'Initial',complete_setup:true},'fresh');assert.equal(r.code,200,JSON.stringify(r.data));
 r=await request('Employee','employees','PATCH',{employee_id:'fresh',nickname:'Requested'},'fresh');assert.equal(r.code,202);
 assert.equal((await value("SELECT nickname FROM employees WHERE employee_id='fresh'")).nickname,'Initial');
 const approved=await request('HR','change-requests','PATCH',{id:r.data.request.id,status:'Approved'});assert.equal(approved.code,200,JSON.stringify(approved.data));
 assert.equal((await value("SELECT nickname FROM employees WHERE employee_id='fresh'")).nickname,'Requested');
 assert.equal((await request('HR','change-requests','PATCH',{id:r.data.request.id,status:'Approved'})).code,409);
});
for(const [role,target,status]of [['HR','employee',200],['HR','director',403],['Finance','director',403],['Director','employee',403],['Team Lead','employee',403],['Administrator','director',200]]) {
 test(`${role} salary history target ${target}`,async()=>{
   assert.equal((await request(role,'salary-history?employeeId='+target)).code,status);
   assert.equal((await request(role,'salary-history','POST',{employee_id:target,effective_date:'2026-10-01',amount:300})).code,status===200?201:status);
 });
}
for(const [role,target,status]of [['HR','employee',200],['HR','director',403],['Finance','employee',403],['Director','employee',403],['Employee','employee',403],['Administrator','director',200]])test(`${role} promotion history target ${target}`,async()=>{
 assert.equal((await request(role,'promotion-history?employeeId='+target)).code,status);
 assert.equal((await request(role,'promotion-history','POST',{employee_id:target,date:'2026-10-01',new_title:'New title'})).code,status===200?201:status);
});
test('Unfiltered salary/promotion/skills listings respect leadership exclusion',async()=>{
 for(const path of ['salary-history','promotion-history','skills']){
  const r=await request('HR',path);assert.equal(r.code,200);assert(!JSON.stringify(r.data).includes('director'));assert(!JSON.stringify(r.data).includes('admin-target'));
 }
});
for(const [role,id,status]of [['Employee','employee',200],['Employee','outside',403],['Team Lead','employee',403],['HR','employee',200],['HR','director',403],['Finance','director',403],['Director','director',200],['Administrator','director',200]])test(`${role} personal documents ${id}`,async()=>assert.equal((await request(role,'documents?employeeId='+id)).code,status));
test('Read-only schema prerequisite verification matches the controlled setup',async()=>{
 const {verifySchema}=await import('../db/verify-schema.mjs');
 assert.deepEqual(await verifySchema(sql),{ok:true,tables:11});
});
test('Normal GET paths execute no schema mutation',async()=>{
 // Include cold first requests from the start of this process (no warm-guard false pass).
 for(const path of ['employees','employees?id=employee','skills?employeeId=employee','documents?employeeId=employee','company-documents','change-requests?scope=queue'])assert.equal((await request('Administrator',path)).code,200);
 assert(queries.length>0);assert(!queries.some(q=>/\b(CREATE|ALTER|DROP|TRUNCATE)\b/i.test(q)),queries.join('\n'));
});
test('Salary and promotion append+sync roll back together on injected sync failure',async()=>{
 for(const [path,column,body]of [['salary-history','current_salary',{effective_date:'2026-10-02',amount:321}],['promotion-history','job_title',{date:'2026-10-02',new_title:'Rollback'}]]){
  const before=await value(`SELECT count(*)::int AS n FROM ${path.replace('-','_')}`);
  failNext(new RegExp('UPDATE employees SET.*'+column,'is'));
  const r=await request('Administrator',path,'POST',{employee_id:'employee',...body});assert.equal(r.code,400,JSON.stringify(r.data));
  assert.equal((await value(`SELECT count(*)::int AS n FROM ${path.replace('-','_')}`)).n,before.n);
 }
});
test('Change application and decision roll back together; cross-employee skills denied',async()=>{
 const r=await request('Employee','employees','PATCH',{employee_id:'employee',nickname:'Rollback request'});assert.equal(r.code,202);
 const previous=await value("SELECT nickname FROM employees WHERE employee_id='employee'");
 failNext(/UPDATE change_requests SET status/is);
 assert.equal((await request('HR','change-requests','PATCH',{id:r.data.request.id,status:'Approved'})).code,400);
 assert.equal((await value("SELECT nickname FROM employees WHERE employee_id='employee'")).nickname,previous.nickname);
 assert.equal((await value('SELECT status FROM change_requests WHERE id=$1',[r.data.request.id])).status,'Pending');
 const skill=await value("SELECT id FROM skills WHERE employee_id='outside' LIMIT 1");
 const bad=await sql`INSERT INTO change_requests(employee_id,request_type,skill_id,payload) VALUES('employee','skill_delete',${skill.id},'{"old":{}}') RETURNING id`;
 assert.equal((await request('HR','change-requests','PATCH',{id:bad[0].id,status:'Approved'})).code,400);
 assert(await value('SELECT id FROM skills WHERE id=$1',[skill.id]));
});
async function allocation(days=20) {
 await database.exec("DELETE FROM leave_requests; DELETE FROM leave_balances");
 await sql`INSERT INTO leave_balances(employee_id,leave_type,year,allocated_days) VALUES('employee','Annual',2026,${days})`;
}
async function leave(body={}) {return request('Employee','leave-requests','POST',{employee_id:'employee',leave_type:'Annual',start_date:'2026-10-29',end_date:'2026-10-29',reason:'Fixture',...body});}
test('Full day, half day, weekends and insufficient submission preserve existing rules',async()=>{
 await allocation();
 let r=await leave();assert.equal(r.code,201);assert.equal(r.data.days_used,1);
 r=await leave({half_day:true});assert.equal(r.code,201);assert.equal(r.data.days_used,0.5);
 r=await leave({start_date:'2026-10-30',end_date:'2026-11-02'});assert.equal(r.code,201);assert.equal(r.data.days_used,2);
 assert.equal((await leave({start_date:'2026-10-31',end_date:'2026-11-01'})).code,400);
 await allocation(0);assert.equal((await leave()).code,400);
});
test('No self-approval; duplicate concurrent and repeated decisions charge once',async()=>{
 await allocation();const r=await leave();const id=r.data.request.id;
 assert.equal((await request('Employee','leave-requests','PATCH',{id,status:'Approved'})).code,403);
 const results=await Promise.all([request('HR','leave-requests','PATCH',{id,status:'Approved'}),request('Administrator','leave-requests','PATCH',{id,status:'Approved'})]);
 assert.deepEqual(results.map(x=>x.code).sort(),[200,409]);
 assert.equal((await value("SELECT used_days FROM leave_balances WHERE employee_id='employee'")).used_days,'1.00');
 assert.equal((await request('HR','leave-requests','PATCH',{id,status:'Rejected'})).code,409);
});
test('Competing pending requests cannot overdraw approval balance',async()=>{
 await allocation(1);const a=await leave(),b=await leave();assert.equal(a.code,201);assert.equal(b.code,201);
 const results=await Promise.all([a,b].map(r=>request('HR','leave-requests','PATCH',{id:r.data.request.id,status:'Approved'})));
 assert.deepEqual(results.map(x=>x.code).sort(),[200,409]);
 assert.equal((await value("SELECT used_days FROM leave_balances WHERE employee_id='employee'")).used_days,'1.00');
 assert.equal((await value("SELECT count(*)::int AS n FROM leave_requests WHERE status='Pending'")).n,1);
});
test('Leave decision/usage roll back together',async()=>{
 await allocation();const r=await leave();failNext(/UPDATE leave_requests SET status/is);
 assert.equal((await request('HR','leave-requests','PATCH',{id:r.data.request.id,status:'Approved'})).code,400);
 assert.equal((await value('SELECT status FROM leave_requests WHERE id=$1',[r.data.request.id])).status,'Pending');
 assert.equal((await value("SELECT used_days FROM leave_balances WHERE employee_id='employee'")).used_days,'0.00');
});
for (const role of Object.keys(actors)) {
 test(role+' change-request review uses actual management role',async()=>{
  assert.equal((await request(role,'change-requests?scope=queue')).code,['Administrator','Director','HR','Finance'].includes(role)?200:403);
 });
 test(role+' leave approval uses scope and no-self rule',async()=>{
  await allocation();const pending=await leave();
  const result=await request(role,'leave-requests','PATCH',{id:pending.data.request.id,status:'Approved'});
  assert.equal(result.code,role==='Employee'?403:200,JSON.stringify(result.data));
 });
}
test('Post-setup skill mutations continue through review, not direct self writes',async()=>{
 const add=await request('Employee','skills','POST',{employee_id:'employee',category:'Language',item:'Test language',level:'2'});
 assert.equal(add.code,202);
 assert.equal((await request('HR','change-requests','PATCH',{id:add.data.request.id,status:'Approved'})).code,200);
 const skill=await value("SELECT id FROM skills WHERE employee_id='employee' AND item='Test language'");
 const update=await request('Employee','skills','PATCH',{id:skill.id,level:'4'});assert.equal(update.code,202);
 assert.equal((await request('HR','change-requests','PATCH',{id:update.data.request.id,status:'Rejected'})).code,200);
 assert.equal((await value('SELECT level FROM skills WHERE id=$1',[skill.id])).level,'2');
 const del=await request('Employee','skills?id='+skill.id,'DELETE');assert.equal(del.code,202);
 assert.equal((await request('HR','change-requests','PATCH',{id:del.data.request.id,status:'Approved'})).code,200);
 assert.equal(await value('SELECT id FROM skills WHERE id=$1',[skill.id]),undefined);
});
test('Current role/status/account is authoritative for seven-day sessions; bootstrap survives',async()=>{
 const token=createSessionToken({user:'finance@example.invalid',role:'Administrator',employee_id:'finance'});
 assert.equal((await requestCookie(token,'admin/accounts?employeeId=employee')).code,403);
 await database.exec("UPDATE employees SET employment_status='Resigned' WHERE employee_id='finance'");
 assert.equal((await requestCookie(token,'employees')).code,401);
 await database.exec("UPDATE employees SET employment_status='Active' WHERE employee_id='finance'; DELETE FROM user_accounts WHERE employee_id='finance'");
 assert.equal((await requestCookie(token,'employees')).code,401);
 assert.equal((await request('Administrator','employees')).code,200);
 const unknown=createSessionToken({user:'adam',role:'EXECUTIVE',employee_id:null});assert.equal((await requestCookie(unknown,'employees')).code,401);
});
test('Organisation, Leave, Documents, Skills and review screens retain their read contracts',async()=>{
 for(const path of ['org-chart','org-units','leave-requests?scope=approvals','leave-balances?employeeId=employee','documents?employeeId=employee','company-documents','skills?employeeId=employee','change-requests?scope=queue']){
  const r=await request('Administrator',path);assert.equal(r.code,200,path+': '+JSON.stringify(r.data));
 }
});
