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

- **Data store:** Google Sheets, same pattern as Ops Dash (service-account
  JWT auth, see `lib/example-sheets-handler.mjs`). Deliberately not SQL —
  keeps the stack consistent with Ops Dash and avoids the complexity jump
  a real database brings, at the cost of needing careful append-only /
  targeted-cell-update discipline (see "Sheets safety" in README.md).
  Revisit if headcount or concurrent-write volume ever makes Sheets the
  bottleneck.
- **Document storage:** Google Drive. CCG already has Workspace, and
  documents currently live scattered in email or don't exist in one place
  at all — Drive consolidates them without adding a new vendor.

## Phase order

| Phase | Scope | Est. duration @ few hrs/wk |
|---|---|---|
| 1 | Employee Directory + Employment + Organisation Structure + Permissions | 4–6 weeks |
| 2 | Notifications (KITAS/passport/contract/probation expiry) + Documents | 3–4 weeks |
| 3 | Leave Management | 2–3 weeks |
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
  worth having early even though it's not compliance-critical.
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

- **Headcount / scale check:** roughly how many employees does this need
  to handle? Affects whether Sheets-as-backend holds up long-term or needs
  revisiting before Phase 1 is built out fully.
- **Recruitment (Phase 8):** build custom, or keep pipelines in
  Monday.com and skip this module? Worth deciding closer to Phase 8 rather
  than now.
- **Multi-user access:** currently Adam-only login (see `lib/auth.mjs`).
  Revisit if/when Yasmin/Gloria need their own logins separate from full
  Ops visibility — likely becomes relevant around Phase 2–3 once
  finance/HR-specific data (documents, leave approvals) exists.

## Status

- [x] Repo scaffold (router, auth, Sheets template, Vite/React shell)
- [x] Phase 1 — Employee Directory + Employment + Org Structure + Permissions
      (backend + frontend built; live once the Google Sheet is created and
      shared per SETUP.md)
- [ ] Phase 2 — Notifications + Documents
- [ ] Phase 3 — Leave Management
- [ ] Phase 4 — Dashboards
- [ ] Phase 5 — Equipment Register, Notes, Policies
- [ ] Phase 6 — Performance Reviews, Skills Matrix, Training, Career Progression
- [ ] Phase 7 — Onboarding / Offboarding
- [ ] Phase 8 — Recruitment
