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
- ~~Employee role self-service (view own record read-only, submit edit
  requests rather than editing directly)~~ *(built — see Status below)* —
  a plain Employee-role account (or Team Lead/Main Lead/Finance) now goes
  through a forced first-login setup, then every further self-edit to
  their own profile or skills becomes a pending change request instead of
  writing directly. Administrator/Director/HR are exempt (editing their
  own record still writes immediately, same as before) since they're the
  ones who'd be approving it anyway.
- ~~Main Lead / Operations / Executive approving leave for their scope~~
  *(built)* — Leave Management reuses this same visibility model for the
  approvals queue (`getVisibleEmployeeIds()` in `lib/permissions.mjs`, used
  by `lib/leave.mjs`): a lead approves requests for their scope,
  Administrator/Director/HR see everyone's.
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
- [ ] Phase 2 — Notifications + Disciplinary Records still outstanding
      (Documents done — see below)
- [x] Phase 3 — Multi-user login + Leave Management — both halves done.
      Leave requests (`lib/leave.mjs`, `src/pages/Leave.jsx`) use the same
      org-chart/lead visibility scoping as Employee Cards: a lead approves
      requests for their scope, Administrator/Director/HR see everyone,
      everyone sees their own. Rules: business days only (weekends
      excluded from the day count); exceeding the remaining balance is a
      hard block, not a warning; only the employee themselves or
      Administrator/Director/HR can submit a request on someone's behalf
      (not a lead). Annual leave resets on each employee's own start_date
      anniversary, not the calendar year — Sick/Emergency stay on a plain
      calendar year (flag it if that should change too). `leave_balances`/
      `leave_requests` were already in `db/schema.sql` as placeholder
      tables from the Postgres migration, so no new migration was needed.
      **Operationally important:** nobody can be approved for a leave type
      until an Administrator/Director/HR sets their allocation via "Manage
      leave allocations" on the Leave page — zero allocated = zero
      remaining = every request blocked by design, not a bug.
- [x] Branding — CCG logo (`src/public/ccglogo.png`) + "HR" wordmark
      (`src/Logo.jsx`) now shown on login, set-password, the initial
      session-check loading screen, and the main dashboard header.
- [x] Org unit "Move" (reparent) — a unit can be moved under a different
      parent from the Org Chart page without deleting/recreating it
      (`lib/org.mjs` PATCH now accepts `parent_unit_name`, with a
      recursive check blocking a unit from being moved under its own
      sub-unit). Added specifically so the old per-company "…Lead" filler
      teams (e.g. "CCL Lead", "I&I Lead") can be emptied out and deleted
      now that the real "Assign lead" feature covers that instead.
- [ ] Org chart visual connector lines — attempted via CSS (border/
      pseudo-element technique) but didn't render correctly live (lines
      ran straight down, didn't attach to nodes, no stagger) — reverted
      back to plain indentation for now. Needs another pass, ideally
      verified against a real screenshot before re-delivering rather than
      reasoned about blind, since this is the second CSS-only attempt that
      hasn't matched what actually renders in the browser.
- [x] Documents — personal + company, built together
      (`lib/documents.mjs`, `src/pages/Documents.jsx`). Personal documents
      (`documents` table — Passport/KITAS/contracts/etc., Drive-linked)
      are visible to the employee themselves plus
      Administrator/HR/Finance/Director see everyone's — deliberately
      flatter than the org-chart/lead visibility used for Employee
      Cards/Leave; a Team Lead does not get their team's personal
      documents just for being a lead. Company documents
      (`company_documents`, new table) are grouped into folders and gated
      by a role-tier hierarchy (Employee < Team Lead < Main Lead < HR <
      Finance < Director < Administrator — each role sees its own tier and
      everything below); upload restricted to Administrator/HR/Director.
      `company_documents` creates itself defensively (`CREATE TABLE IF NOT
      EXISTS`) the first time it's queried, so — unlike the org_units
      sort_order column — there's no separate migration URL to remember to
      visit.
- [x] Real Drive upload (`lib/drive-client.mjs`, `lib/multipart.mjs`) —
      added after the initial Documents build, once it became clear
      employees uploading their own personal documents needed more than a
      paste-a-link box. Picking a file in the app uploads it straight into
      an auto-created Drive folder structure inside a Shared Drive (see
      `SETUP.md` step 5 for the one-time Shared Drive + service-account
      sharing setup): `Employees/<employee_id> - <nickname or full
      name>/` for personal documents, `Company/<permission tier>/` for
      company documents. Folders are found-or-created on demand, nothing
      needs pre-making by hand. Pasting a link still works as a fallback
      (per Adam's explicit "keep both") — e.g. for a file that already
      lives somewhere else in Drive and shouldn't be duplicated. New
      dependency: `busboy` (parses the multipart upload body — the one
      place in this codebase that uses a small library instead of raw
      fetch, since hand-rolling multipart boundary parsing is genuinely
      easy to get subtly wrong). New env var: `GOOGLE_DRIVE_ID`.
- [x] Design Discipline — a fixed three-checkbox widget (Architecture/
      Landscape/Interior, each revealing a 0–5 level dropdown once
      checked) on the Employee Card, shown first, above the generic skills
      categories (`DesignDisciplinePanel` in `src/pages/EmployeeCard.jsx`).
      Backed by the same `skills` table as everything else — `'Design
      Discipline'` is a real `category` value (`lib/skills.mjs`), just one
      the generic "Add skill" form deliberately excludes so it can only
      ever hold exactly those three items, never stray free-text entries.
- [x] First-login setup + self-service change requests — a real
      per-person login (anyone other than the master-admin bootstrap) is
      forced through a one-time onboarding screen (`src/pages/Setup.jsx`)
      before they can reach the rest of the app: fill in contact/personal
      fields and skills/Design Discipline, then "Finish setup." That first
      pass writes directly (`employees.profile_setup_completed_at` flips
      from `NULL` to a timestamp — see `lib/employees.mjs`). After that,
      any further self-edit to those same fields — via "Edit full profile"
      (`EmployeeForm.jsx`) or the Employee Card's skills widgets
      (`EmployeeCard.jsx`) — no longer applies immediately. It's recorded
      as a `Pending` row in the new `change_requests` table
      (`lib/change-requests.mjs`) instead, shows up as "pending HR
      approval" inline wherever it was submitted from, and only takes
      effect once approved from the new "Change requests" nav tab
      (`src/pages/ChangeRequests.jsx`, Administrator/HR/Director only —
      matches `FULL_VISIBILITY_ROLES`, same set that's exempt from ever
      needing to submit a request for their own record). Covers exactly
      `SELF_SERVICE_FIELDS` (contact/personal info — nickname, photo,
      phone, address, emergency contact, nationality, DOB, religion,
      office location) plus skill add/update/delete; everything
      employment- or compensation-related (salary, role, department, KITAS/
      passport/contract dates, etc.) stays HR/Admin-only as before,
      unaffected by any of this.
- [ ] Phase 2 remainder — Notifications (KITAS/passport/contract/probation
      expiry) + Disciplinary Records still outstanding; Documents (above)
      is done.
- [ ] Phase 4 — Dashboards
- [ ] Phase 5 — Equipment Register, Notes, Policies
- [ ] Phase 6 — Performance Reviews, Skills Matrix, Training, Career Progression
- [ ] Phase 7 — Onboarding / Offboarding
- [ ] Phase 8 — Recruitment
