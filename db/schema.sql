-- CCG HR Dashboard — Postgres schema
--
-- Supersedes the Google Sheets backend. Design goals, in order:
--   1. Cover everything currently in Sheets (Employees, OrgUnits, Skills,
--      SalaryHistory, PromotionHistory) with real referential integrity —
--      the whole point of this migration.
--   2. Placeholder tables for Documents and Leave Management so those
--      phases slot in without another schema rewrite.
--   3. Built with an eventual multi-tenant, sellable product in mind, but
--      NOT multi-tenant yet — no company_id/tenant_id columns anywhere.
--      Adding that later means one migration (add the column, backfill,
--      add to indexes) rather than redesigning tables from scratch, since
--      every table already has a clean single-purpose shape.
--
-- Row Level Security (RLS): deliberately NOT used. RLS solves browser-to-
-- database access with a per-user Postgres identity (Supabase's own
-- Auth + auto-generated API pattern) — this app doesn't do that. The
-- frontend only ever talks to the Vercel API layer (lib/*.mjs), which
-- connects with one shared DATABASE_URL credential and does authorization
-- in application code (requireAuth/requireRole, plus the per-row
-- "employee sees only their own record" logic coming in Phase 3). Postgres
-- itself is never exposed to anything untrusted, so RLS would be
-- redundant, and given the connection pooler role bypasses RLS by default
-- anyway (would need a separate low-privileged role + FORCE ROW LEVEL
-- SECURITY + policies keyed off something not currently passed to
-- Postgres at all), it's not a low-effort toggle either. Revisit only if
-- the architecture changes to have the frontend talk to Supabase directly
-- instead of going through this app's own API — more likely if/when this
-- becomes the multi-tenant product mentioned above.
-- Naming/typing conventions used throughout:
--   - snake_case everywhere, matching the Sheets header names 1:1 where
--     possible so the migration script and rewritten lib/*.mjs files are a
--     mechanical translation, not a redesign.
--   - `employee_id` stays a human-readable TEXT primary key (e.g. CCG-001)
--     rather than switching to a surrogate integer/UUID — preserves
--     continuity with existing data and every place that already
--     references it by that string (manager_id, team assignments, etc.).
--   - DATE for pure calendar dates (birthdays, contract dates, expiries —
--     nothing about them is time-zone sensitive). TIMESTAMPTZ for anything
--     that's really "when did this happen" (created_at, entered_at).
--   - CHECK constraints instead of native Postgres ENUM types for
--     controlled-vocabulary fields (employment_status, permission_role,
--     etc.). Functionally similar, but altering a CHECK constraint is a
--     plain ALTER TABLE, no CREATE TYPE/ALTER TYPE ceremony — matches how
--     often these value lists have already changed during the Sheets
--     build (Probation got dropped from employment_status, role got
--     renamed to permission_role, etc.).
--
-- Real correctness upgrades this migration buys, worth calling out since
-- they were literally bugs/near-misses on Sheets:
--   - `org_units.parent_unit_name` is now a real self-referential FK — a
--     typo'd parent name fails the INSERT instead of silently producing an
--     orphaned branch of the org chart.
--   - `employees.team` / `employees.department` are real FKs into
--     org_units — the "Team " trailing-space bug that would've silently
--     dropped a team's members from the org chart is now a constraint
--     violation at write time, not a support ticket later.
--   - `employees.manager_id` is a real self-referential FK — can't point
--     at an employee_id that doesn't exist.

-- ─── Organisation structure ─────────────────────────────────────────────

CREATE TABLE org_units (
  unit_name          TEXT PRIMARY KEY,
  -- 'Company' kept in the CHECK constraint for flexibility/existing data,
  -- but the app's "Add unit" UI no longer offers it as of the org-chart
  -- cleanup — CC/CC Landscape/Pelago etc. are separate companies
  -- externally, but organisationally they're just teams under Operations
  -- (see lib/org-cleanup.mjs, which retypes any existing 'Company' rows).
  unit_type          TEXT NOT NULL CHECK (unit_type IN ('Group', 'Company', 'Department', 'Team')),
  parent_unit_name   TEXT REFERENCES org_units(unit_name) ON DELETE RESTRICT,
  -- Nullable manual ordering for the Org Chart tree — NULL sorts last
  -- (alphabetically) behind anything with an explicit order, so setting
  -- this on a handful of units doesn't affect anything else's position.
  sort_order         INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
  -- lead_employee_id added further down, after `employees` exists — it's a
  -- circular reference (org_units -> employees, employees.team/department
  -- -> org_units) so it can't be inline here on a fresh run.
);

CREATE INDEX idx_org_units_parent ON org_units(parent_unit_name);

-- ─── Employees ───────────────────────────────────────────────────────────

CREATE TABLE employees (
  employee_id                     TEXT PRIMARY KEY,
  full_name                       TEXT NOT NULL,
  nickname                        TEXT,
  photo_url                       TEXT,
  email                            TEXT,
  phone                            TEXT,
  address                          TEXT,
  emergency_contact_name          TEXT,
  emergency_contact_phone         TEXT,
  emergency_contact_relationship  TEXT,
  date_of_birth                   DATE,
  nationality                     TEXT,
  religion                        TEXT CHECK (religion IN (
                                     'Islam', 'Kristen', 'Katholik', 'Hindu', 'Buddha', 'Konghucu', 'NA'
                                   )),
  employment_status               TEXT NOT NULL DEFAULT 'Active' CHECK (employment_status IN (
                                     'Active', 'On Leave', 'Notice Period', 'Terminated', 'Resigned'
                                   )),
  start_date                      DATE,
  end_date                        DATE,
  company                         TEXT,
  department                      TEXT REFERENCES org_units(unit_name) ON DELETE SET NULL,
  job_title                       TEXT,
  team                            TEXT REFERENCES org_units(unit_name) ON DELETE SET NULL,
  manager_id                      TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
  office_location                 TEXT,
  employment_type                 TEXT CHECK (employment_type IN (
                                     'Full-time', 'Part-time', 'Contractor', 'Freelance', 'Intern'
                                   )),
  contract_type                   TEXT CHECK (contract_type IN ('PKWT', 'PKWTT')),
  contract_start                  DATE,
  contract_end                    DATE,
  probation_end_date              DATE,
  current_salary                  NUMERIC(14, 2),
  salary_currency                 TEXT CHECK (salary_currency IN ('IDR', 'USD')),
  bonus_eligible                  BOOLEAN NOT NULL DEFAULT false,
  kitas_expiry                    DATE,
  passport_expiry                 DATE,
  work_permit_expiry              DATE,
  permission_role                 TEXT NOT NULL DEFAULT 'Employee' CHECK (permission_role IN (
                                     'Employee', 'Team Lead', 'Main Lead', 'HR', 'Finance', 'Director', 'Administrator'
                                   )),
  -- NULL until a real per-person login finishes the forced first-login
  -- setup screen (src/pages/Setup.jsx) — gates access to the rest of the
  -- app while NULL, and switches every further self-edit to their own
  -- record from "applies immediately" to "submits a change_requests row"
  -- once set. See lib/employees.mjs.
  profile_setup_completed_at      TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employees_manager ON employees(manager_id);
CREATE INDEX idx_employees_team ON employees(team);
CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_employees_status ON employees(employment_status);

-- Keep updated_at honest automatically instead of relying on every write
-- path in application code to remember to set it (Sheets required that
-- discipline everywhere; Postgres can just enforce it).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER employees_set_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Now that `employees` exists, add the other half of the circular
-- reference: which employee leads a given org unit (Team or Department —
-- in principle any unit, not restricted by CHECK, since a Company/Group
-- could reasonably have a named lead too). Powers "assign a lead" from the
-- dashboard and, later, Phase 3's "Main Lead approves leave for their
-- team" routing.
ALTER TABLE org_units
  ADD COLUMN lead_employee_id TEXT REFERENCES employees(employee_id) ON DELETE SET NULL;

-- ─── Skills / Employee Card ──────────────────────────────────────────────

CREATE TABLE skills (
  id            SERIAL PRIMARY KEY,
  employee_id   TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  -- 'Design Discipline' powers a dedicated Architecture/Landscape/Interior
  -- checkbox widget on the Employee Card (src/pages/EmployeeCard.jsx),
  -- kept separate from the general "Add skill" form's category choices.
  category      TEXT NOT NULL CHECK (category IN (
                  'Design Discipline', 'Software Skill', 'Technical Skill', 'Soft Skill', 'Language',
                  'Certification', 'Training Completed', 'Training Required', 'Career Path'
                )),
  item          TEXT NOT NULL,
  level         TEXT CHECK (level IN ('0', '1', '2', '3', '4', '5')),
  notes         TEXT,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_skills_employee ON skills(employee_id);

-- ─── Salary / promotion history ─────────────────────────────────────────
-- Append-only by convention (same as on Sheets) — application code doesn't
-- issue UPDATE/DELETE against these, only INSERT.

CREATE TABLE salary_history (
  id               SERIAL PRIMARY KEY,
  employee_id      TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  effective_date   DATE NOT NULL,
  amount           NUMERIC(14, 2) NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'IDR',
  reason           TEXT,
  entered_by       TEXT,
  entered_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_salary_history_employee ON salary_history(employee_id);

CREATE TABLE promotion_history (
  id                SERIAL PRIMARY KEY,
  employee_id       TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  promotion_date    DATE NOT NULL,
  previous_title    TEXT,
  new_title         TEXT NOT NULL,
  notes             TEXT,
  entered_by        TEXT,
  entered_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_promotion_history_employee ON promotion_history(employee_id);

-- ─── Placeholder: Documents (Phase 2) ────────────────────────────────────
-- Files themselves still live in Google Drive (that decision doesn't
-- change) — this table just tracks metadata + the Drive link, same shape
-- Sheets would have held, now with a real FK instead of a loose employee_id
-- string column.

CREATE TABLE documents (
  id              SERIAL PRIMARY KEY,
  employee_id     TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  document_type   TEXT NOT NULL CHECK (document_type IN (
                    'Employment Contract', 'NDA', 'Passport', 'KITAS', 'Tax Document',
                    'Qualification', 'Certificate', 'Signed Policy', 'Performance Review', 'Other'
                  )),
  drive_file_id   TEXT,
  drive_link      TEXT,
  expiry_date     DATE,
  uploaded_by     TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT
);

CREATE INDEX idx_documents_employee ON documents(employee_id);
CREATE INDEX idx_documents_expiry ON documents(expiry_date) WHERE expiry_date IS NOT NULL;

-- ─── Company-wide documents (Phase 2, built alongside personal docs) ────
-- Separate table from `documents` above since these aren't tied to any one
-- employee — they're organisation-wide files (policies, handbooks, forms)
-- grouped into folders and gated by role tier rather than by org-chart
-- scope. `access_role` is the minimum permission_role "rank" required to
-- see a folder's documents (see lib/documents.mjs's ROLE_RANK — same order
-- as the CHECK below, low to high); `folder` is just a free-text display
-- grouping, doesn't have to match access_role's name 1:1. `uploaded_by` is
-- plain TEXT rather than a FK into employees on purpose — the master-admin
-- bootstrap login has no employee_id at all, and a FK here would reject
-- every upload made through that login.
-- lib/documents.mjs also creates this table defensively (CREATE TABLE IF
-- NOT EXISTS) the first time it's queried, so an existing live database
-- doesn't need a manual migration step for this one.

CREATE TABLE company_documents (
  id             SERIAL PRIMARY KEY,
  folder         TEXT NOT NULL,
  access_role    TEXT NOT NULL CHECK (access_role IN (
                    'Employee', 'Team Lead', 'Main Lead', 'HR', 'Finance', 'Director', 'Administrator'
                  )),
  title          TEXT NOT NULL,
  drive_file_id  TEXT,
  drive_link     TEXT,
  notes          TEXT,
  uploaded_by    TEXT,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_documents_access_role ON company_documents(access_role);

-- ─── Placeholder: Disciplinary records (Phase 2, added per Adam's ask) ──
-- Deliberately separate from `documents` even though disciplinary records
-- could partly be files — this table is the structured log (date, type,
-- outcome) an attached file supplements, not replaces. `confidential`
-- defaults true since this is more sensitive than most HR data — worth
-- gating harder than the general permission_role check once real
-- role-based access is built.

CREATE TABLE disciplinary_records (
  id             SERIAL PRIMARY KEY,
  employee_id    TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  record_date    DATE NOT NULL,
  record_type    TEXT NOT NULL,
  description    TEXT NOT NULL,
  action_taken   TEXT,
  confidential   BOOLEAN NOT NULL DEFAULT true,
  entered_by     TEXT,
  entered_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_disciplinary_employee ON disciplinary_records(employee_id);

-- ─── Placeholder: Leave management (Phase 3) ────────────────────────────

CREATE TABLE leave_balances (
  id             SERIAL PRIMARY KEY,
  employee_id    TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  leave_type     TEXT NOT NULL CHECK (leave_type IN ('Annual', 'Sick', 'Emergency')),
  year           INTEGER NOT NULL,
  allocated_days NUMERIC(5, 2) NOT NULL DEFAULT 0,
  used_days      NUMERIC(5, 2) NOT NULL DEFAULT 0,
  UNIQUE (employee_id, leave_type, year)
);

CREATE TABLE leave_requests (
  id             SERIAL PRIMARY KEY,
  employee_id    TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  leave_type     TEXT NOT NULL CHECK (leave_type IN ('Annual', 'Sick', 'Emergency')),
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  half_day       BOOLEAN NOT NULL DEFAULT false,
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by    TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
  approved_at    TIMESTAMPTZ,
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);

-- ─── Placeholder: multi-user login accounts (Phase 3) ───────────────────
-- Deliberately a separate table from `employees` rather than adding
-- password_hash/login columns onto the employees table directly — keeps
-- auth credentials out of the table that every HR read touches, and means
-- not every employee needs an account row (e.g. someone who's left doesn't
-- need login access removed from their historical HR record, just from
-- this table).

CREATE TABLE user_accounts (
  id                       SERIAL PRIMARY KEY,
  employee_id              TEXT UNIQUE REFERENCES employees(employee_id) ON DELETE CASCADE,
  email                    TEXT UNIQUE NOT NULL,
  password_hash            TEXT,
  magic_link_token         TEXT,
  magic_link_expires_at    TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at            TIMESTAMPTZ
);

-- ─── Self-service change requests (built alongside first-login setup) ──
-- Once profile_setup_completed_at is set, further self-edits to a plain
-- Employee/Team Lead/Main Lead/Finance login's own profile fields
-- (SELF_SERVICE_FIELDS in lib/employees.mjs) or their own skills entries
-- (lib/skills.mjs) land here as a Pending row instead of writing directly,
-- and only take effect once an Administrator/HR/Director approves it from
-- the "Change requests" nav tab (src/pages/ChangeRequests.jsx). One table
-- covers all four request_type values rather than one table per type —
-- they share every concern except what's actually being changed, and that
-- part is different enough per type (a handful of profile fields vs. one
-- skill row) that a discriminated `payload` blob is a better fit than
-- juggling four narrow tables. `payload` is TEXT (JSON.stringify/parse at
-- the boundary), not JSONB — this schema doesn't use JSONB anywhere else,
-- so there's no reason to take on that column type for something this
-- simple. lib/change-requests.mjs also creates this table defensively
-- (CREATE TABLE IF NOT EXISTS) the first time it's queried, same as
-- company_documents above, so an existing live database doesn't need a
-- manual migration step for this either.

CREATE TABLE change_requests (
  id             SERIAL PRIMARY KEY,
  employee_id    TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  request_type   TEXT NOT NULL CHECK (request_type IN ('profile', 'skill_add', 'skill_update', 'skill_delete')),
  -- Set for skill_update/skill_delete. Deliberately no FK — if the skills
  -- row this points at gets deleted directly by an admin while the request
  -- is still pending, approving it should fail gracefully, not cascade-
  -- delete the request itself.
  skill_id       INTEGER,
  payload        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by    TEXT,
  reviewed_at    TIMESTAMPTZ,
  review_notes   TEXT
);

CREATE INDEX idx_change_requests_employee ON change_requests(employee_id);
CREATE INDEX idx_change_requests_status ON change_requests(status);
