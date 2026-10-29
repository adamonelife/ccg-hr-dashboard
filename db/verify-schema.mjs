// Read-only deployment prerequisite. Never self-heal schema from a request.
import { pathToFileURL } from 'node:url';
import { getSql } from '../lib/db.mjs';
import { EMPLOYEE_FIELDS } from '../shared/employee-policy.mjs';
export async function verifySchema(sql) {
  const required = {
    employees: [...EMPLOYEE_FIELDS, 'profile_setup_completed_at', 'created_at', 'updated_at'],
    org_units: ['unit_name','unit_type','parent_unit_name','lead_employee_id','sort_order'],
    skills: ['id','employee_id','category','item','level','notes','added_at'],
    documents: ['id','employee_id','document_type','drive_file_id','drive_link','expiry_date','notes','uploaded_by','uploaded_at'],
    company_documents: ['id','folder','access_role','title','drive_file_id','drive_link','notes','uploaded_by','uploaded_at'],
    change_requests: ['id','employee_id','request_type','skill_id','payload','status','requested_at','reviewed_by','reviewed_at','review_notes'],
    salary_history: ['id','employee_id','effective_date','amount','currency','reason','entered_by','entered_at'],
    promotion_history: ['id','employee_id','promotion_date','previous_title','new_title','notes','entered_by','entered_at'],
    leave_balances: ['id','employee_id','leave_type','year','allocated_days','used_days'],
    leave_requests: ['id','employee_id','leave_type','start_date','end_date','half_day','reason','status','requested_at','approved_by','approved_at'],
    user_accounts: ['employee_id','email','password_hash','magic_link_token','magic_link_expires_at','last_login_at'],
  };
  const rows=await sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'`;
  const present=new Set(rows.map(r=>r.table_name+'.'+r.column_name));
  const missing=Object.entries(required).flatMap(([table,cols])=>cols.filter(c=>!present.has(table+'.'+c)).map(c=>table+'.'+c));
  const checks=await sql`SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace`;
  const category=checks.find(c=>c.conname==='skills_category_check')?.definition || '';
  for(const name of ['Design Discipline','Software Skill','Technical Skill','Soft Skill','Language','Certification','Training Completed','Training Required','Career Path']) {
    if(!category.includes("'"+name+"'"))missing.push('skills category '+name);
  }
  for(const name of ['skills_level_check','leave_balances_employee_id_leave_type_year_key','employees_permission_role_check','change_requests_request_type_check','change_requests_status_check','company_documents_access_role_check']) {
    if(!checks.some(c=>c.conname===name))missing.push('constraint '+name);
  }
  if(missing.length)throw new Error('Schema prerequisite missing: '+missing.join(', '));
  return {ok:true,tables:Object.keys(required).length};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const sql=getSql();try {console.log(JSON.stringify(await verifySchema(sql)));} finally {await sql.end();}
}
