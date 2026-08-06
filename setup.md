# Phase 1 setup — Google Sheet

Phase 1 (Employee Directory, Employment, Organisation Structure, Permissions
groundwork) needs one Google Sheet with four tabs. Create it, then share it
with the same service account Ops Dash uses (or a new dedicated one) as
Editor.

## 1. Create the sheet

Create a new Google Sheet, e.g. named "CCG HR — Employee Data". Add four
tabs with these exact names and header rows (row 1). Everything is
case-sensitive — the code matches these headers exactly.

### Tab: `Employees`

One row per employee. This is the core record everything else hangs off.

Row 1 headers (columns A onward, in this order):

```
employee_id | full_name | nickname | photo_url | email | phone | emergency_contact_name | emergency_contact_phone | emergency_contact_relationship | date_of_birth | nationality | religion | employment_status | start_date | end_date | company | department | job_title | team | manager_id | office_location | employment_type | contract_type | contract_start | contract_end | probation_end_date | current_salary | salary_currency | bonus_eligible | kitas_expiry | passport_expiry | work_permit_expiry | permission_role | created_at | updated_at
```

Notes:
- `employee_id`: pick a convention now (e.g. `CCG-001`) — it's the primary
  key used everywhere else (salary history, promotion history, reporting
  lines).
- `nickname`: for disambiguation where multiple people share a first name
  (common enough with Indonesian names to be worth a dedicated field rather
  than cramming it into `full_name`). Shown right next to the name in the
  Directory table, not just on the edit form.
- `manager_id`: another row's `employee_id`, not a name — this is the only
  reporting-line field (no separate team-lead/main-lead fields; they'd have
  been redundant with `manager_id` plus `team`). Blank if someone has no
  single direct manager (e.g. a flat leadership team) — they just won't
  appear in the flat reporting-lines view, but still show up grouped under
  their `team` on the org chart tree.
- `photo_url`: leave blank for now: this becomes a Google Drive link once
  Phase 2 (Documents) wires up Drive storage.
- `religion`: needed for Indonesian THR (Tunjangan Hari Raya) — the
  mandatory religious-holiday allowance, an extra month's pay timed to each
  employee's own religious holiday (Idul Fitri, Christmas, Nyepi, etc.).
  Free text, matching Indonesia's officially recognized categories is
  sensible (Islam, Kristen, Katolik, Hindu, Buddha, Konghucu) but not
  enforced by the code.
- `permission_role`: one of `Employee`, `Team Lead`, `Main Lead`, `HR`,
  `Finance`, `Director`, `Administrator` — groundwork for permissions, not
  to be confused with `job_title`. `job_title` is the real business title
  (3D Artist, Producer, Head of Operations); `permission_role` is purely an
  access-control classification the app uses to gate sensitive routes (see
  `requireRole` in `lib/auth.mjs`). Only Adam has an actual login today, so
  it doesn't gate anything in practice yet, but the field should be filled
  in as employees are added so it's ready when multi-user login arrives.
- `employment_status`: one of `Active`, `On Leave`, `Notice Period`,
  `Terminated`, `Resigned`. This is the single source of truth for whether
  someone shows up in the default Directory view — there's deliberately no
  separate `active` flag, since a second field that can silently contradict
  this one is worse than one field doing the job. There's also no
  `Probation` status: probation is already tracked via `probation_end_date`
  (today's date vs. that value tells you if someone's on probation), so a
  separate status value would just be duplicating it. `Terminated`/
  `Resigned` are excluded by default; everything else counts as active.
- `employment_type` (Full-time/Part-time/Contractor/Freelance/Intern) and
  `employment_status` are deliberately separate fields, not redundant with
  each other — one is the nature of the arrangement, the other is where
  that arrangement currently stands (e.g. a Contractor can be Active or
  Terminated same as a Full-time employee).
- `bonus_eligible`: `TRUE`/`FALSE`.
- Dates: use `YYYY-MM-DD` consistently.

### Tab: `SalaryHistory`

```
employee_id | effective_date | amount | currency | reason | entered_by | entered_at
```

Append-only log. Adding an entry here also updates `current_salary` /
`salary_currency` on the matching `Employees` row.

### Tab: `PromotionHistory`

```
employee_id | date | previous_title | new_title | notes | entered_by | entered_at
```

Append-only log. Adding an entry here also updates `job_title` on the
matching `Employees` row.

### Tab: `OrgUnits`

Defines the Company → Department → Team hierarchy independently of who's
currently assigned, so the org chart works even for units with no one
staffed yet.

```
unit_type | unit_name | parent_unit_name
```

`unit_type` is one of `Company`, `Department`, `Team`. `parent_unit_name`
is blank for top-level Company rows. Example:

```
Company    | Concepts Conveyed Group |
Department | Creative                | Concepts Conveyed Group
Team       | RT3D                    | Creative
Team       | RT2D                    | Creative
Department | Production              | Concepts Conveyed Group
```

Employees attach to a `Team` node by matching their `team` field on the
`Employees` tab to a `unit_name` here.

**Order of operations matters:** the Employee form's `department` and
`team` fields are live dropdowns sourced from this tab (via `/api/org-units`)
rather than free text, so a Department/Team has to exist here *before* it
shows up as selectable when adding or editing an employee. Add rows here
first, then use them.

## 2. Share with the service account

Share the sheet (Editor access) with the email in `GOOGLE_CLIENT_EMAIL`.
Reuses the same Ops Dash service account if HR data can live in the same
Google Workspace project — otherwise set up a new one and use its
credentials instead.

## 3. Set env vars

Add to Vercel (and your local `.env` if running `vercel dev`):

```
HR_SHEET_ID=<the sheet's ID from its URL>
GOOGLE_CLIENT_EMAIL=<service account email>
GOOGLE_PRIVATE_KEY=<service account private key>
```

Once that's set, `/api/employees`, `/api/org-chart`, `/api/org-units`,
`/api/salary-history`, and `/api/promotion-history` are live.
