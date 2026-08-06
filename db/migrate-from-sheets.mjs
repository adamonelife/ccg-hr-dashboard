// db/migrate-from-sheets.mjs — CLI version.
//
// Not needed if you're managing this app entirely through GitHub's web
// upload + Vercel (no local Node/Terminal) — use the built-in admin
// endpoint instead: log in to the app, then visit
// /api/admin/migrate-from-sheets in your browser. It reads the exact same
// env vars straight from Vercel, no local setup required. See SETUP.md.
//
// This file is for anyone who does have Node.js + Terminal available and
// would rather run it locally:
//
//   DATABASE_URL=... HR_SHEET_ID=... GOOGLE_CLIENT_EMAIL=... GOOGLE_PRIVATE_KEY='...' \
//     node db/migrate-from-sheets.mjs
//
// All the actual migration logic (including the safety check against
// re-running on a non-empty database) lives in lib/migrate.mjs, shared with
// the admin endpoint — this file is just a thin wrapper that prints
// progress and exits cleanly.

import { runMigration } from '../lib/migrate.mjs';
import { getSql } from '../lib/db.mjs';

runMigration()
  .then(async (summary) => {
    console.log(JSON.stringify(summary, null, 2));
    console.log('Done.');
    await getSql().end();
  })
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
