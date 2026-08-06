# CCG HR Dashboard — Roadmap

Full target scope is a 16-module HRIS with three role-based dashboards
(Executive, Team Lead, Employee), covering everything from the employee
directory through recruitment. That's comparable to a product like BambooHR
or HiBob, not a quick feature — so it's being built in phases, each of
which ships something usable on its own rather than waiting for full scope.

Pace: a few hours a week (side-of-desk alongside Ops role). No phase is
currently blocked by a hard external deadline (no imminent KITAS/visa
renewal etc. as of the roadmap being written), so ordering is driven by
dependency, compliance risk, and daily-use value rather than urgency.

## Backend decisions (locked in)

- **Data store: Postgres** (Supabase or Neon, hosted, not Vercel Postgres —
  that's Neon rebranded and defeats the point of decoupling from the
  platform). **Supersedes the original Google Sheets decision below.**
  Switched before Phase 2/3 rather than after, specifically because Sheets
  can't safely handle concurrent writes (Phase 3's leave-approval workflow
  needs real transactional guarantees) and Documents needs proper
  relational structure between employees/files/Drive links. Doing the
  switch now, while only Phase 1 (employees, org chart, skills/cards) needs
  migrating, is a lot less rework than migrating three phases' worth later.
  Also step one toward this eventually becoming a standalone, sellable
  product — schema designed with that in mind (see `db/schema.sql`), though
  not multi-tenant yet. SQL access is raw queries via the `postgres` npm
  package, no ORM — matches how the rest of the codebase already talks to
  every other external service (direct calls, no SDK abstraction layer).
  **Requires the pooled/PgBouncer connection string from the provider, not
  the direct one** — serverless functions open a new DB connection per
  invocation, and the direct connection string will exhaust Postgres's
  connection limit under concurrent load otherwise.
- ~~Data store: Google Sheets~~ *(superseded)* — original reasoning kept
  for context: same pattern as Ops Dash (service-account JWT auth), chosen
  to keep the stack consistent with Ops Dash and avoid the complexity jump
  a real database brings. That tradeoff stopped being worth it once
  concurrent writes (Phase 3) and relational structure (Documents) were
  both about to be needed at once. The Google service account itself isn't
  going away — Phase 2 (Documents) still needs it for Drive.
- **Document storage:** Google Drive (unchanged). CCG already has
  Workspace, and documents currently live scattered in email or don't
  exist in one place at all — Drive consolidates them without adding a new
  vendor. Now paired with the `documents` table in Postgres for metadata
  rather than a Sheets tab.

## Phase order

| Phase | Scope | Est. duration @ few hrs/wk |
|---|---|---|
| 1 | Employee Directory + Employment + Organisation Structure + Permissions | 4–6 weeks |
| 2 | Notifications (KITAS/passport/contract/probation expiry) + Documents + Disciplinary Records | 3–4 weeks |
| — | Employee Card (pulled forward from Phase 6) | TBD, see below |
| 3 | Multi-user login + Leave Management | 3–4 weeks (grew — now includes auth, see notes) |
| 4 | Dashboards — Executive / Team Lead / Employee | 2 weeks |
| 5 | Equipment Register, Employee Notes, Company Policies | 1–2 weeks |
| 6 | Performance Reviews, Skills Matrix, Training, Career Progression | 4–5 weeks |
| 7 | Onboarding / Offboarding workflows | 2–3 weeks |
| 8 | Recruitment (pending build-vs-Monday.com decision) | 2–4 weeks |

Total: roughly 5–7 months to full scope.

**Deferred / not currently planned:** Attendance (clock in/out, timesheets,
overtime) — marked optional from the outset; revisit only if a concrete
need shows up.

### Why this order

- **Phase 1 first** because every other module references an employee
  record, a reporting line, or a role. Also the single biggest chunk of
  day-to-day value on its own: who works here, their status, contract/visa
  dates, who they report to.
- **Phase 2 second** because KITAS/passport/work-permit/contract expiry
  tracking is the one area with genuine legal/business risk in Indonesia —
  a missed renewal costs real money or worse. This is where the Ops Dash
  reconciliation-sweep pattern (daily cron, self-heals, Slack summary only
  on change) earns its keep.
- **Phase 3 (Leave)** is the highest-frequency feature once it exists —
  worth having early even though it's not compliance-critical. It's also the
  point where Adam-only login stops being viable — see "Permission model
  for multi-user login" below, decided but not yet built.
- **Employee Card** (unscheduled, slotted in ahead of Phase 3 at Adam's
  request) is a pulled-forward slice of Phase 6's Skills Matrix — a
  single-person summary view ("baseball card") rather than the full
  training/review machinery. Viewable by Adam today under the current
  single-login setup; extending it to other execs waits on multi-user login
  landing as part of Phase 3.
- **Phase 4 (Dashboards)** comes after because they're read-only views
  composing Phases 1–3 data — cheap once the underlying data exists,
  expensive/pointless to build first.
- **Phase 5** are quick, low-complexity wins used as filler between bigger
  phases.
- **Phase 6** (reviews/skills/training/career progression) is richer and
  more form-heavy but lower urgency than compliance or leave.
- **Phase 7** (onboarding/offboarding) pays off well because it hooks into
  Slack/Google Workspace/Monday account provisioning patterns already
  proven in Ops Dash.
- **Phase 8 (Recruitment)** last, and possibly out of scope entirely —
  open question below.

## Open questions

- ~~Headcount / scale check~~ *(resolved by the Postgres switch)* — with
  50+ employees and up to 20 concurrent logins expected once Phase 3 ships,
  Sheets' shared API quota and lack of write locking were a real ceiling.
  Postgres removes this as an open question.
- **Recruitment (Phase 8):** build custom, or keep pipelines in
  Monday.com and skip this module? Worth deciding closer to Phase 8 rather
  than now.
- **Multi-user access:** currently Adam-only login (see `lib/auth.mjs`).
  No longer a "someday" question — Phase 3 (Leave approvals) genuinely
  requires it, since approvals only make sense if the approver and
  requester are different logged-in people. Login mechanism decided:
  magic link via email for first-time account setup, letting each person
  create their own password from there rather than logging in via magic
  link every time. Not yet built.

### Permission model for multi-user login (decided, not yet built)

- **Employee:** can view only their own record. Read-only — no direct
  editing of their own data, but can submit an edit request for someone
  with appropriate permission to action (rather than editing the source of
  truth directly). No visibility into anyone else's data, the directory, or
  the org chart beyond their own entry.
- **Main Lead:** can approve leave requests for their own team.
- **Operations / Executive:** can approve leave requests for anyone,
  regardless of team.
- Maps onto the existing `permission_role` field on the Employees sheet
  (`Employee`, `Team Lead`, `Main Lead`, `HR`, `Finance`, `Director`,
  `Administrator`) — exact implementation (e.g. how "their team" resolves
  for a Main Lead — direct reports only, or the full chain beneath them)
  still needs nailing down when Phase 3 is actually built.

## Status

- [x] Repo scaffold (router, auth, Sheets template, Vite/React shell)
- [x] Phase 1 — Employee Directory + Employment + Org Structure + Permissions
      (built on Sheets originally; being migrated to Postgres, see below)
- [x] Employee Card (built on Sheets originally; being migrated to Postgres)
- [ ] **Sheets → Postgres migration** (in progress)
  - [x] Schema designed (`db/schema.sql`) — employees, org_units, skills,
        salary_history, promotion_history, plus placeholder tables for
        documents, disciplinary_records, leave_balances, leave_requests,
        user_accounts
  - [x] Schema applied to Supabase (Adam — confirmed "Success. No rows
        returned")
  - [x] `lib/employees.mjs`, `lib/org.mjs`, `lib/skills.mjs`,
        `lib/salary-history.mjs`, `lib/promotion-history.mjs` rewritten for
        SQL (`lib/db.mjs` added as the shared connection/coercion helper).
        API contract unchanged — no frontend files needed to change.
  - [x] Migration script written (`db/migrate-from-sheets.mjs`) — not yet
        run; depends on whether there's real Sheets data worth copying
  - [ ] Pooled `DATABASE_URL` added to Vercel (Adam)
  - [ ] `npm install` run locally/on deploy to pull in the new `postgres`
        dependency
  - [ ] Migration script run, if there's existing Sheets data to bring over
  - [ ] Frontend re-verified against the new backend (Directory, Employee
        Card, Org Chart, add/edit flows)
  - [ ] Delete stray `api/index.mjs` (dead file from an earlier abandoned
        routing fix — `api/[[...path]].mjs` is the real router) and
        `lib/example-sheets-handler.mjs` (superseded scaffold example) from
        the repo
- [ ] Phase 2 — Notifications + Documents + Disciplinary Records
- [ ] Phase 3 — Multi-user login + Leave Management
- [ ] Phase 4 — Dashboards
- [ ] Phase 5 — Equipment Register, Notes, Policies
- [ ] Phase 6 — Performance Reviews, Skills Matrix, Training, Career Progression
- [ ] Phase 7 — Onboarding / Offboarding
- [ ] Phase 8 — Recruitment
