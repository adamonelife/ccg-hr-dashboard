# Phase 1 setup — Postgres (Supabase)

Phase 1 (Employee Directory, Employment, Organisation Structure, Permissions
groundwork) plus the Employee Card feature is backed by Postgres now, not
Google Sheets — see `ROADMAP.md`'s "Backend decisions" section for why the
switch happened. This doc covers what to actually set up.

## 1. Create the database

1. Sign up at [supabase.com](https://supabase.com) and create a new project.
2. In the SQL Editor, paste the entire contents of `db/schema.sql` and run
   it. This creates all 10 tables (`employees`, `org_units`, `skills`,
   `salary_history`, `promotion_history`, plus placeholder tables for
   `documents`, `disciplinary_records`, `leave_balances`, `leave_requests`,
   `user_accounts` — those last five are Phase 2/3 groundwork, not used
   yet). "Success. No rows returned" is the expected result — it's DDL, not
   a query.
3. Go to Project Settings → Database → Connection string, and copy the
   **Transaction pooler** string (port `6543`), not the direct connection
   (port `5432`). This matters: Vercel functions open a new DB connection
   per invocation, and the direct connection string will exhaust Postgres's
   connection limit under concurrent load. See `lib/db.mjs` for more detail.

## 2. Set env vars

Add to Vercel (and your local `.env` if running `vercel dev`):

```
DATABASE_URL=<the pooled connection string from step 1.3>
```

The `postgres` npm package needs installing once (`npm install` picks it up
from `package.json`; Vercel does this automatically on deploy).

Once `DATABASE_URL` is set, `/api/employees`, `/api/org-chart`,
`/api/org-units`, `/api/salary-history`, `/api/promotion-history`, and
`/api/skills` are all live against Postgres.

## 3. Google service account — still needed, just not for this

`GOOGLE_CLIENT_EMAIL` / `GOOGLE_PRIVATE_KEY` are no longer the database
credentials. Keep them set only if you're running `db/migrate-from-sheets.mjs`
(see below) or building Phase 2's Drive integration. If you're starting
fresh with no existing Sheets data, you can skip this entirely.

## 4. Migrating existing Sheets data (optional, one-time)

If the old HR Google Sheet already has real rows in it (employees, org
units, history, skills), run the migration script once to copy them into
Postgres:

```
DATABASE_URL=... HR_SHEET_ID=... GOOGLE_CLIENT_EMAIL=... GOOGLE_PRIVATE_KEY='...' \
  node db/migrate-from-sheets.mjs
```

It's safe to run against a sheet that's empty or only partially filled in —
see the comment block at the top of `db/migrate-from-sheets.mjs` for exactly
what it does and its re-run behaviour (org_units/employees are safe to
re-run; the three history/log tables are not, once they have real rows).

If the Sheet never had real data in it (e.g. you were still designing the
schema when the Postgres switch happened), skip this step entirely and just
start adding employees through the app once it's live — no need to round-trip
through Sheets first.

---

## Reference: the old Sheets-era column layout

Kept here only because the migration script's field names mirror it exactly
— useful if you're troubleshooting a migration or comparing against an old
export. Not the live schema; see `db/schema.sql` for that.

### `Employees` tab

```
employee_id | full_name | nickname | photo_url | email | phone | emergency_contact_name | emergency_contact_phone | emergency_contact_relationship | date_of_birth | nationality | religion | employment_status | start_date | end_date | company | department | job_title | team | manager_id | office_location | employment_type | contract_type | contract_start | contract_end | probation_end_date | current_salary | salary_currency | bonus_eligible | kitas_expiry | passport_expiry | work_permit_expiry | permission_role | created_at | updated_at
```

### `SalaryHistory` tab

```
employee_id | effective_date | amount | currency | reason | entered_by | entered_at
```

### `PromotionHistory` tab

```
employee_id | date | previous_title | new_title | notes | entered_by | entered_at
```

### `Skills` tab

```
employee_id | category | item | level | notes | added_at
```

### `OrgUnits` tab

```
unit_type | unit_name | parent_unit_name
```
