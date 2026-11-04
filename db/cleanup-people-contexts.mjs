// Explicit operator task for an approved environment. Never deletes binding/audit evidence.
import { pathToFileURL } from "node:url";
import { getSql } from "../lib/db.mjs";
export async function cleanupPeopleContexts(sql) {
  return sql.begin(async (tx) => {
    const handoffs =
      await tx`DELETE FROM platform.people_handoff_requests WHERE expires_at<=now() OR consumed_at IS NOT NULL RETURNING id`;
    const contexts =
      await tx`DELETE FROM platform.people_auth_contexts WHERE expires_at<=now() OR revoked_at IS NOT NULL RETURNING id`;
    return { handoffs: handoffs.length, contexts: contexts.length };
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const sql = getSql();
  try {
    console.log(JSON.stringify(await cleanupPeopleContexts(sql)));
  } finally {
    await sql.end();
  }
}
