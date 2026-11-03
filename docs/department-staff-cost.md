# People staff-cost Department contract (v2)

GET /api/integrations/operations/staff-cost retains its existing service-only Bearer token, x-nallin-environment check and private/no-store response. Dashboard sessions alone do not grant access. People salary read/edit permissions are unchanged.

The response is schemaVersion: 2 and grouping: "People Department ID".
The existing organisationUnits array remains the group envelope to reduce consumer changes. Each group has:

- departmentId: stable departments.id (landscape, archviz, interactive, pelago, marketing, sales, management), or null for Unassigned.
- departmentName: registry display name, or "Unassigned".
- unit: compatibility field equal to departmentId; it is no longer a Team display name.
- Existing headcount, salary completeness, per-currency amounts and averages.

Only groups with active employees are emitted. Resigned/Terminated employees remain excluded. Currency separation, missing salary/currency handling, totals reconciliation and individual-data omission are unchanged. Unknown non-null IDs fail closed rather than silently being assigned to a guessed group. Team and org_units are not queried. No employee data or salary is written.

Operations consumers must use departmentId for matching; Team-name matching must not be used for v2. No Operations consumer or invoice mapping is changed by this People-only release.
