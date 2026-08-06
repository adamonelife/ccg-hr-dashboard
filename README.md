# CCG HR Dashboard

Separate app from `ccg-ops-dashboard` by design — sensitive HR data, real
login (vs. Ops Dash's link-only access), own Vercel Hobby function/cron
budget. Will eventually feed a summary into Ops Dash via a small API,
mirroring the existing Xero/HubSpot integration pattern, without Ops Dash
holding sensitive records itself.

This is a scaffold. No HR features are built yet — just the plumbing, copied
from the patterns proven in Ops Dash so the first real feature can be built
fast and consistent.

## Structure

```
api/[[...path]].mjs   the only file in /api — catch-all router (stays under
                       Vercel Hobby's 12-function cap)
lib/                   real handlers, one file per concern, registered in
                       the router's `routes` object
lib/auth.mjs           session auth (single password, HMAC-signed httpOnly
                       cookie) — see "Auth" below
lib/example-sheets-handler.mjs
                       TEMPLATE, not wired in. Copy it when you build the
                       first feature that touches a Google Sheet.
src/                   Vite + React frontend. App.jsx checks /api/auth/me on
                       load and shows Login.jsx if unauthenticated.
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
tab in a Sheet is enough at this scale), and add a `role` field to the
session payload so handlers can gate finance-only vs. HR-only data.

## Adding a new endpoint

1. Write the handler in `lib/whatever.mjs` (copy `lib/example-sheets-handler.mjs`
   if it needs Google Sheets).
2. Import it in `api/[[...path]].mjs` and add it to the `routes` object,
   wrapped in `requireAuth(...)` unless it's genuinely public.
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
`SESSION_SECRET`.
