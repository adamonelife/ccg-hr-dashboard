// Explicit read-only QA/deployment preflight; never called by an HTTP request.
import { pathToFileURL } from "node:url";
import { getSql } from "../lib/db.mjs";
import { verifyPeopleBindings } from "./verify-people-bindings.mjs";
export async function verifyPeopleHandoff(sql) {
  await verifyPeopleBindings(sql);
  const tables =
    await sql`SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='platform' AND c.relname IN ('people_handoff_requests','people_auth_contexts')`;
  if (tables.length !== 2 || tables.some((t) => !t.relrowsecurity))
    throw new Error("People context RLS prerequisite missing");
  const exposed =
    await sql`SELECT table_name FROM information_schema.table_privileges WHERE table_schema='platform' AND table_name IN ('people_handoff_requests','people_auth_contexts') AND grantee IN ('PUBLIC','anon','authenticated')`;
  if (exposed.length)
    throw new Error("People contexts must remain server-only");
  const lifecycle =
    await sql`SELECT p.prosecdef,t.tgenabled FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.employees'::regclass AND t.tgname='detach_people_binding' AND NOT t.tgisinternal`;
  if (
    lifecycle.length !== 1 ||
    lifecycle[0].prosecdef ||
    lifecycle[0].tgenabled !== "O"
  )
    throw new Error("People binding deletion lifecycle prerequisite missing");
  const columns =
    await sql`SELECT column_name FROM information_schema.columns WHERE table_schema='platform' AND table_name='people_identity_bindings' AND column_name IN ('original_employee_id','managed_legacy','detached_reason')`;
  if (columns.length !== 3) throw new Error("People lifecycle columns missing");
  return { ok: true, serverOnly: true, boundEmployeeDeletion: true };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const sql = getSql();
  try {
    console.log(JSON.stringify(await verifyPeopleHandoff(sql)));
  } finally {
    await sql.end();
  }
}
