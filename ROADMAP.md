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
- ~~Multi-user access~~ *(built — see Status below)* — real per-person
  login now exists alongside the original Adam-only master password. Login
  mechanism ended up simpler than the original magic-link-via-email plan:
  no email sending is wired up at all (deliberate call, to avoid taking on
  email infrastructure — Resend/Google Workspace delegation/etc. — before
  it's actually needed). An admin generates a one-time setup link
  (`lib/accounts.mjs`) and shares it manually (Slack, WhatsApp, whatever);
  the person visits it once to set their own password
  (`POST /api/auth/set-password`), then logs in normally with email +
  password from then on. Revisit real email delivery if manual sharing
  becomes annoying at higher headcount.

### Permission model for multi-user login (built)

- **Card/profile visibility** follows the org chart, not a flat role
  check: a Team's lead sees that team; a Department's lead sees everyone
  nested under it (all its teams, sub-departments, etc.); scales up the
  same way to Company/Group. Driven by `org_units.lead_employee_id` (set
  via the Org Chart page's "Assign lead" control) with a recursive lookup
  down the tree — see `lib/permissions.mjs`. `Administrator`/`Director`/`HR`
  see everyone, no scoping needed.
- **Scope of what's actually gated today:** the Employee Card and the
  "Edit full profile" page (`lib/employees.mjs`, `lib/skills.mjs`). The
  Directory list and Org Chart tree are **not** scoped yet — everyone
  authenticated still sees the full list/tree (names, titles, departments),
  just not full profile/skills detail outside their scope. Directory-wide
  restriction (e.g. a plain Employee seeing only their own row) is a
  separate, not-yet-built piece.
- **Employee role self-service (view own record read-only, submit edit
  requests rather than editing directly):** not yet built — a plain
  Employee-role account can currently edit their own record like anyone
  else within their own scope. Worth tightening before rolling accounts
  out beyond leads.
- **Main Lead / Operations / Executive approving leave for their scope:**
  still pending — this permission model only covers card/profile
  visibility so far, not leave approval routing (that's Phase 3's Leave
  Management piece, not yet built).
- Maps onto the existing `permission_role` field on `employees`
  (`Employee`, `Team Lead`, `Main Lead`, `HR`, `Finance`, `Director`,
  `Administrator`) — role casing had to be normalized to match this exactly
  everywhere (`requireRole(...)` calls, the master-admin bootstrap session)
  since real per-person sessions now carry whatever's actually in that
  column.

## Status

- [x] Repo scaffold (router, auth, Sheets template, Vite/React shell)
- [x] Phase 1 — Employee Directory + Employment + Org Structure + Permissions
      (built on Sheets originally; being migrated to Postgres, see below)
- [x] Employee Card (built on Sheets originally; being migrated to Postgres)
- [x] **Sheets → Postgres migration** — done. Schema designed and applied,
      `DATABASE_URL` set in Vercel, `lib/employees.mjs`/`org.mjs`/
      `skills.mjs`/`salary-history.mjs`/`promotion-history.mjs` rewritten
      for SQL, existing Sheets data migrated via the one-time admin
      endpoint (`GET /api/admin/migrate-from-sheets`,
      `lib/migrate.mjs`/`db/migrate-from-sheets.mjs`), frontend verified
      live.
  - [ ] Still outstanding: delete stray `api/index.mjs` (dead file from an
        earlier abandoned routing fix) and `lib/example-sheets-handler.mjs`
        (superseded scaffold example) from the repo — harmless left as-is,
        just clutter
- [x] Org structure management — add/delete companies/departments/teams
      and assign a lead per unit, all from the Org Chart page
      (`lib/org.mjs`, `src/pages/OrgChart.jsx`) — no more hand-editing a
      sheet for this.
- [x] Employee Card edit/delete — skill entries can be corrected or removed
      after adding, not just appended (`lib/skills.mjs` PATCH/DELETE,
      `SkillRow` in `EmployeeCard.jsx`). Skill level is now a controlled
      0–5 scale, not free text.
- [ ] Phase 2 — Notifications + Documents + Disciplinary Records
- [x] Phase 3 — Multi-user login (see permission model notes above) — real
      per-person accounts, password auth, org-chart-based Employee Card
      visibility scoping. Leave Management itself (the other half of
      Phase 3) not yet built.
- [ ] Phase 4 — Dashboards
- [ ] Phase 5 — Equipment Register, Notes, Policies
- [ ] Phase 6 — Performance Reviews, Skills Matrix, Training, Career Progression
- [ ] Phase 7 — Onboarding / Offboarding
- [ ] Phase 8 — Recruitment
