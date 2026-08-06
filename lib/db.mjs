// lib/db.mjs — shared Postgres connection (see db/schema.sql for the schema).
//
// Uses the `postgres` package (porsager/postgres) — raw tagged-template
// SQL, no ORM, matching how every other external service in this codebase
// is called directly rather than through an SDK/abstraction layer.
//
// DATABASE_URL must be the POOLED connection string (Supabase calls it the
// "Transaction pooler", port 6543) — not the direct one (port 5432).
// Serverless functions open a new connection per invocation; the direct
// connection string will exhaust Postgres's connection limit under
// concurrent load.
//
// `prepare: false` is required alongside that: transaction-mode poolers
// (PgBouncer, and Supabase's pooler is PgBouncer under the hood) don't
// support prepared statements persisting across requests the way a direct
// connection does — leaving this on causes intermittent "prepared statement
// does not exist" errors under load.
//
// `ssl: 'require'` forces TLS on the connection to Supabase rather than
// relying on that being the default — this carries password hashes and
// other HR data, so the connection being encrypted in transit shouldn't be
// an assumption.

import postgres from 'postgres';

let _sql = null;

export function getSql() {
  if (_sql) return _sql;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not configured');
  }
  _sql = postgres(connectionString, { prepare: false, ssl: 'require' });
  return _sql;
}

// ---- value coercion helpers ----
//
// The frontend/API contract was deliberately kept identical to the Sheets
// era (see lib/employees.mjs etc.) — same field names, same 'TRUE'/'FALSE'
// string convention for booleans, same 'YYYY-MM-DD' string convention for
// dates. That means no frontend changes for this migration, but it means
// every lib/*.mjs file needs to translate at the boundary: real Postgres
// types in, Sheets-flavoured JSON out (and vice versa on writes).

// DATE column -> 'YYYY-MM-DD' string. Defensive either way: if the
// `postgres` driver hands back a JS Date, format it; if it's already a
// string, pass it through unchanged. (Not worth hard-coding an assumption
// about exactly how the driver parses DATE columns.)
export function formatDate(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

// TIMESTAMPTZ column -> full ISO string, matching the
// `new Date().toISOString()` convention already used everywhere else.
export function formatTimestamp(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  return value;
}

// BOOLEAN column -> 'TRUE'/'FALSE' string (frontend checkbox convention).
export function formatBool(value) {
  return value ? 'TRUE' : 'FALSE';
}

// 'TRUE'/'FALSE' (or a real boolean) from a request body -> real boolean.
export function parseBool(value) {
  return value === true || value === 'TRUE';
}

// '' or undefined -> null. Postgres rejects '' for DATE/NUMERIC columns,
// whereas Sheets treated everything as text so blank strings were always
// fine. Apply to any optional field before insert/update.
export function nullifyEmpty(value) {
  return value === '' || value === undefined ? null : value;
}
