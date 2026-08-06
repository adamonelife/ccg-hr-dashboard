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
employee_id | full_name | photo_url | email | phone | emergency_contact_name | emergency_contact_phone | emergency_contact_relationship | date_of_birth | nationality | religion | employment_status | start_date | end_date | company | department | job_title | team | team_lead_id | main_lead_id | manager_id | office_location | employment_type | contract_type | contract_start | contract_end | probation_end_date | current_salary | salary_currency | bonus_eligible | kitas_expiry | passport_expiry | work_permit_expiry | role | active | created_at | updated_at
```

Notes:
- `employee_id`: pick a convention now (e.g. `CCG-001`) — it's the primary
  key used everywhere else (salary history, promotion history, reporting
  lines).
- `team_lead_id` / `main_lead_id` / `manager_id`: these hold another row's
  `employee_id`, not a name — lets the org chart and reporting lines resolve
  names dynamically.
- `photo_url`: leave blank for now: this becomes a Google Drive link once
  Phase 2 (Documents) wires up Drive storage.
- `religion`: needed for Indonesian THR (Tunjangan Hari Raya) — the
  mandatory religious-holiday allowance, an extra month's pay timed to each
  employee's own religious holiday (Idul Fitri, Christmas, Nyepi, etc.).
  Free text, matching Indonesia's officially recognized categories is
  sensible (Islam, Kristen, Katolik, Hindu, Buddha, Konghucu) but not
  enforced by the code.
- `role`: one of `Employee`, `Team Lead`, `Main Lead`, `HR`, `Finance`,
  `Director`, `Administrator` — groundwork for permissions. Only Adam has an
  actual login today, so this doesn't gate anything yet, but the field
  should be filled in as employees are added so it's ready when multi-user
  login arrives.
- `active`: `TRUE`/`FALSE` — soft delete flag so leaving employees stay in
  history instead of being removed.
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

Once that's set, `/api/employees`, `/api/org-chart`, `/api/salary-history`,
and `/api/promotion-history` are live.
