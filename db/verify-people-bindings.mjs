// Optional deployment preflight, separate from legacy verify-schema. Read-only.
import {pathToFileURL} from 'node:url';
import {getSql} from '../lib/db.mjs';
export async function verifyPeopleBindings(sql) {
 const columns=await sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='platform' AND table_name IN ('people_identity_bindings','people_binding_audit')`;
 const present=new Set(columns.map(c=>`${c.table_name}.${c.column_name}`));
 const required={people_identity_bindings:['auth_user_id','organisation_id','employee_id','review_status','binding_version','approval_reference','reviewed_by','reviewed_at','changed_by'],people_binding_audit:['auth_user_id','actor_user_id','event','previous_record','current_record','occurred_at']};
 const missing=Object.entries(required).flatMap(([t,cols])=>cols.filter(c=>!present.has(`${t}.${c}`)).map(c=>`${t}.${c}`));
 if(missing.length)throw new Error('People binding schema prerequisite missing');
 const tables=await sql`SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='platform' AND c.relname IN ('people_identity_bindings','people_binding_audit')`;
 if(tables.length!==2||tables.some(t=>!t.relrowsecurity))throw new Error('People binding RLS prerequisite missing');
 const exposed=await sql`SELECT table_name FROM information_schema.table_privileges WHERE table_schema='platform' AND table_name IN ('people_identity_bindings','people_binding_audit') AND grantee IN ('PUBLIC','anon','authenticated')`;
 if(exposed.length)throw new Error('People binding tables must remain server-only');
 const trigger=await sql`SELECT p.prosecdef,t.tgenabled FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='platform.people_identity_bindings'::regclass AND t.tgname='people_binding_change' AND NOT t.tgisinternal`;
 if(trigger.length!==1||trigger[0].prosecdef||trigger[0].tgenabled!=='O')throw new Error('People binding audit trigger prerequisite missing');
 return {ok:true,tables:2,seedsRequired:false,loginChanged:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const sql=getSql();try{console.log(JSON.stringify(await verifyPeopleBindings(sql)));}finally{await sql.end();}
}
