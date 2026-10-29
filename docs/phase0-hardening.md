# Phase 0 hardening

No branding, navigation, Staff Access, module-switcher or data migration is included.

## Explicit field authority

- Administrator: all existing employee fields, including permission_role; existing delete/account management retained.
- Director, HR, Finance: existing employee profile/employment/compensation management within existing target scope, except role assignment. New employees default to Employee; only Administrator assigns a different permission_role.
- Leads: existing led-unit/descendant visibility and scoped skill assessment; no subordinate employee-profile writes. Own personal-field updates follow normal self-service rules.
- Employee: own fourteen existing personal/contact fields; setup direct-save, then approval. No protected employment, identity, bank, compensation or role writes.
- Salary history remains Administrator/HR/Finance; promotion remains Administrator/HR. Both now apply target exclusions. Director is deliberately not granted those endpoints.
- No EXECUTIVE mapping is introduced.

The Directory returns only its seven rendered summary fields plus can_view_detail; management roles additionally retain the rendered start_date. Existing employee IDs are unchanged. The detail response adds editable-field metadata, and the unchanged-looking form submits only authorised fields. Read-only subordinate profiles retain their information and access to the existing skill card.

## Schema ownership

Production's required columns/tables/checks were verified before removal of request-time schema guards. `db/schema.sql` remains the explicit fresh-database setup. `npm run verify-schema` is a read-only prerequisite check and fails on missing requirements; it never executes DDL. Existing databases missing requirements must be repaired through a separately controlled setup operation, never by opening a page. No production schema changes are needed for this release.

## Transactions and leave

Salary append/current-salary sync, promotion append/current-title sync, change-request target update/status, and leave decision/usage are atomic. Request rows are locked before decisions; leave balance rows are locked before charging. Repeated decisions return a conflict. Approval rechecks the same existing insufficient-balance hard limit; insufficient decisions leave the request Pending and usage unchanged. Pending requests do not reserve days. Existing annual/sick/emergency cycle calculation, weekend exclusion, half-day arithmetic and no-self-approval remain. Anniversary-crossing and reservation policy decisions remain deferred.

## Legacy session protection

Every protected employee-linked request reloads current role/status and requires the existing matching login account. Removed accounts and Resigned/Terminated employees are denied. No new token/session architecture is introduced. The signed Administrator bootstrap remains independent. Password-reset-wide session invalidation and shared-grant lifecycle belong to the later access transition.

## Tests

`npm test` uses synthetic data only, no network/database credentials or production emails. API tests run the actual catch-all router and handlers against an in-memory PostgreSQL engine (PGlite) through a tagged-query test adapter. Tests cover role/scope denials, payload keys, UI permission alignment, profile/skill setup/review, transaction failure rollback, repeated/concurrent decision calls, and query capture proving normal reads contain no schema DDL. UI tests render the actual components, including the empty half-day form.

PGlite serialises transactions: parallel decision-call tests establish application idempotency and outcomes, but are not a multi-connection PostgreSQL contention stress test. Production uses PostgreSQL row locks and transactions through the existing postgres driver. No destructive production QA is performed.
