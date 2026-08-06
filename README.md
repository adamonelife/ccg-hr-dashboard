# CCG HR Dashboard

Separate app from `ccg-ops-dashboard` by design — sensitive HR data, real
login (vs. Ops Dash's link-only access), own Vercel Hobby function/cron
budget. Will eventually feed a summary into Ops Dash via a small API,
mirroring the existing Xero/HubSpot integration pattern, without Ops Dash
holding sensitive records itself.

Phase 1 (Employee Directory, Employment, Organisation Structure, Permissions
groundwork) is built. See `ROADMAP.md` for what's next and `SETUP.md` for
the one manual step required before Phase 1 goes live: creating and sharing
the Google Sheet it reads/writes.

## Structure

```
api/[[...path]].mjs   the only file in /api — catch-all router (stays under
                       Vercel Hobby's 12-function cap)
lib/                   real handlers, one file per concern, registered in
                       the router's `routes` object
lib/auth.mjs           session auth (single password, HMAC-signed httpOnly
                       cookie, role on the session) — see "Auth" below
lib/sheets-client.mjs  shared Google Sheets client (JWT auth + read/append/
                       targeted-update helpers). Unlike Ops Dash, which
                       duplicates this boilerplate per file, HR centralizes
                       it — this app has enough Sheets-backed modules that
                       duplicating token logic would be a bug magnet.
lib/employees.mjs      Employee Directory + Employment (Phase 1)
lib/salary-history.mjs append-only salary log, syncs current_salary back to
                       the employee record
lib/promotion-history.mjs
                       append-only promotion log, syncs job_title back
lib/org.mjs            Organisation Structure — company/department/team
                       tree + flat reporting lines
lib/example-sheets-handler.mjs
                       superseded by sheets-client.mjs, kept only as a raw
                       JWT-pattern reference
src/                   Vite + React frontend. App.jsx checks /api/auth/me on
                       load and shows Login.jsx if unauthenticated; once
                       logged in it's a simple 3-view nav (Directory,
                       employee add/edit form, Org chart).
```

## Auth

Adam-only for now (per the open question in the original handoff — resolved
as: just Adam, not Yasmin/Gloria, until there's a concrete need). One shared
`ADMIN_PASSWORD` env var, session stored as a signed httpOnly cookie
(`hr_session`), 7-day expiry.

To wrap a new route so it requires login:

```js
import { requireAuth } from '../lib/auth.mjs';
routes['leave/requests'] = requireAuth(handleLeaveRequests);
```

**When Yasmin/Gloria need their own logins:** replace the single
`ADMIN_PASSWORD` check in `lib/auth.mjs` with a per-user lookup (a "Users"
tab in a Sheet is enough at this scale). The `role` field already exists on
the session payload (Adam's session is hard-coded to `role: 'administrator'`
today) and `requireRole(...roles)` in `lib/auth.mjs` is already wired up —
extending to multi-user is mostly about the login/lookup step, not the
permission-checking plumbing.

## Adding a new endpoint

1. Write the handler in `lib/whatever.mjs`, importing from
   `lib/sheets-client.mjs` if it needs Google Sheets (see `lib/employees.mjs`
   for the pattern: define a headers array matching the sheet tab, use
   `readRange`/`appendRow`/`updateRow`).
2. Import it in `api/[[...path]].mjs` and add it to the `routes` object,
   wrapped in `requireAuth(...)` or `requireRole(...)(...)` unless it's
   genuinely public.
3. If it needs the raw body (webhook signature verification), add its route
   name to `RAW_BODY_ROUTES`.

## Patterns carried over from Ops Dash (see original handoff for full detail)

- **Monday.com / HubSpot / Xero / Slack**: same fetch-based patterns as Ops
  Dash apply if HR ever needs them (unlikely for Monday/HubSpot/Xero;
  possible for Slack — e.g. leave-approval notifications).
- **Redis dedupe**: build this in from the start for any notification flow
  (e.g. leave-request approvals) — duplicate Slack messages were a recurring
  Ops Dash bug from re-firing webhooks.
- **Reconciliation sweep**: for anything that can silently drift (leave
  balances, contract renewal dates), add a daily cron that re-checks against
  source of truth and self-heals, with a `?dryRun=true` mode and a Slack
  summary only when something actually changed.
- **Cron limits**: Hobby plan allows once/day per cron job — more frequent
  schedules fail silently at deploy (the cron just doesn't show up). Stagger
  multiple daily jobs across hours.
- **Vercel logs**: ~1hr retention on this plan. Any background job should
  post its own summary to Slack rather than relying on log-digging.
- **Sheets safety**: never blind `clear()` + rewrite. Append-only or
  targeted-cell-update only — this caused a 3hr data loss once in Ops Dash.
- **Stale in-memory state**: after any write in a function, use the value
  you just wrote for subsequent logic in that same function, not a
  pre-write snapshot — avoids duplicate-trigger bugs.
- **ID type mismatches**: cast both sides before comparing IDs from
  different sources (webhook payload vs. config) — `===` silently fails
  on number-vs-string with zero error output.

## Local dev

```
npm install
npm run dev        # Vite dev server (frontend)
vercel dev          # in a second terminal, serves /api on :3000
```

## Deploy

Standard Vercel: connect the repo, set the env vars from `.env.example`,
deploy. `vercel.json` sets `maxDuration: 60` on the catch-all function and
starts with an empty `crons` array — add jobs there as needed (max once/day
each on Hobby).

## Env vars

See `.env.example`. At minimum for the scaffold to boot: `ADMIN_PASSWORD`,
`SESSION_SECRET`. Phase 1 additionally needs `GOOGLE_CLIENT_EMAIL`,
`GOOGLE_PRIVATE_KEY`, and `HR_SHEET_ID` — see `SETUP.md` for creating and
sharing the sheet.
