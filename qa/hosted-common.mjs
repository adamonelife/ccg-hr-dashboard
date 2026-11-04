import fs from 'node:fs/promises';
import postgres from 'postgres';
export const dir=new URL('../work/hosted-qa/',import.meta.url);
const hosted=process.env.VERCEL_ENV==='preview';
export const branch=hosted?{SUPABASE_URL:process.env.PEOPLE_PLATFORM_URL,POSTGRES_URL:process.env.DATABASE_URL}:JSON.parse(await fs.readFile(new URL('branch-private.json',dir),'utf8'));
export const project='xbaiwwykrdoalgtandli';
if(branch.SUPABASE_URL!==`https://${project}.supabase.co`)throw new Error('QA branch mismatch');
export const sql=postgres(branch.POSTGRES_URL,{prepare:false,ssl:'require',max:4,connect_timeout:15});
const [context]=await sql`SELECT project_ref,environment FROM platform.environment_context WHERE singleton`;
if(context?.project_ref!==project||context.environment!=='preview')throw new Error('QA database context mismatch');
export const save=async(name,value)=>fs.writeFile(new URL(name,dir),JSON.stringify(value,null,2),{mode:0o600});
export const load=async name=>hosted?(name==='fixtures-private.json'?JSON.parse(process.env.PEOPLE_QA_FIXTURES_JSON):name==='people-env-private.json'?process.env:{}):JSON.parse(await fs.readFile(new URL(name,dir),'utf8'));
export async function protectedSnapshot(){
 const tables=await sql`SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('projects','integrations','int_platform','int_secrets') ORDER BY schemaname,tablename`;
 const state={};for(const t of tables){const query=`SELECT count(*)::int AS n,md5(coalesce(string_agg(row_to_json(x)::text,',' ORDER BY row_to_json(x)::text),'')) hash FROM "${t.schemaname}"."${t.tablename}" x`;state[t.schemaname+'.'+t.tablename]=(await sql.unsafe(query))[0];}return state;
}
