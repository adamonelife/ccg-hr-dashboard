# People Staff Access handoff — QA stage

4 November 2026. Development only. Depends on the reviewed-binding preparation in PR #11. Neither migration has been applied to production. No production grant, registry entry, binding, employee/account, environment variable or authentication deployment has changed.

## Entry and authority

Both `PEOPLE_STAFF_ACCESS_ENABLED` and `PEOPLE_PLATFORM_ENFORCEMENT_ENABLED` default OFF. Entry ON requires enforcement ON plus explicit origins, environment, organisation UUID, nonempty reviewed UUID cohort, independent encryption key and broker secret. Invalid configuration fails closed. No name/email matching or automatic provisioning occurs. `.env.example` contains no credentials or live identity IDs.

The companion runs inside an isolated copy of canonical Staff Access. It checks the People entitlement over an authenticated server backchannel. The broker passes the provider access token only through that backchannel; it never passes a refresh token to People. The browser carries a short-lived opaque one-use code and state. A separate HttpOnly browser nonce and exact callback Origin are required. A different existing People identity or bootstrap session cannot be silently replaced.

The code is pinned to `hr`, organisation, environment, provider subject/session and binding version. Provider `/auth/v1/user` validation and the current `auth.sessions` record are checked before trusting decoded claims. Encrypted server context expires at the earlier of provider token expiry or one hour; there is no silent refresh. People cookies contain only an opaque context reference, employee ID and existing account email, never provider tokens.

Every authenticated request rechecks provider session, explicit active module grant/registry, membership, account controls, reviewed binding, current People employee status/role and existing account eligibility. Invalid platform context cannot fall back to legacy authentication. Only explicitly `managed_legacy` employees acquire the platform ceiling on legacy login/session; unrelated legacy users and emergency bootstrap retain their existing behavior.

Platform ADMIN or SuperAdmin does not become People Administrator. Existing People roles, target restrictions, fields, salary/history permissions and service-token staff-cost authentication remain authoritative. `VIEW_ONLY` or `executive` caps that existing scope to read only; Executive never maps to Director. All mutations and side-effectful administrative GETs are denied server-side. Shared UI controls hide write actions and forms without changing read scope. Incomplete setup stays incomplete; Executive incomplete-setup entry is denied. Missing People accounts/hashes remain ineligible. On Leave/Notice Period preserve existing semantics; Resigned/Terminated are denied.

Managed writes use one outer authority transaction, preserve nested business-write atomicity, revalidate before commit and buffer the response until commit. Revocation takes effect on the next request. Row locks serialize existing binding/membership/grant/account/session changes with in-flight writes; this is not a claim that remote provider revocation can cancel a transaction after it commits.

## Bound employee deletion resolved

The existing Administrator-only destructive delete remains the same business action with the same confirmation and cascades. A BEFORE DELETE trigger atomically detaches the live employee reference, revokes the binding, increments its version and revokes local contexts. The immutable original employee ID and versioned binding audit remain. The authenticated deletion actor/source is recorded separately from the original binding reviewer. A failed delete rolls back employee deletion, detachment, revocation and audit together. Administrator self-deletion succeeds and invalidates its session. Reusing an employee ID cannot reactivate the old binding or managed legacy access.

This does not add a binding-management UI or grant People administrators platform administration. Binding keys remain immutable and bindings cannot be hard-deleted. Auth-user deletion remains RESTRICT while referenced by historical binding evidence; platform identity removal needs separately reviewed lifecycle handling. Normal account disable/revocation remains available. Do not treat People employee deletion as platform-account deletion or offboarding.

## Operator checks and cleanup

Apply the two optional migration files explicitly to an approved non-production database, in timestamp order. Normal requests never run DDL. Run `node db/verify-people-handoff.mjs` using that environment's existing server database connection. It checks binding/context server-only RLS, absence of browser-role grants and enabled invoker audit/deletion triggers. This is separate from legacy schema checks.

`node db/cleanup-people-contexts.mjs` deletes only expired/consumed ephemeral handoffs and expired/revoked encrypted contexts; it preserves binding/audit evidence. Arrange an environment-specific scheduled operator run before hosted activation and verify monitoring/retention. Do not expose this operator task as a public HTTP route. Configure and verify host-level rate limits on public handoff start/callback and existing login routes before activation. Neither a production cron nor firewall policy was installed in this stage.

## Reproducible isolated certification

Run `npm ci --ignore-scripts`, `npm test`, `npm run build`. The suite exercises actual People API routes, PostgreSQL constraints/triggers/transactions in PGlite, synthetic platform identities and a controlled provider transport. No employee business data, real password/email, setup email, document upload, leave request or change request was used.

For browser QA, run `node --experimental-test-module-mocks qa/handoff-server.mjs <path-to-reviewed-staff-access-source>`. This development-only harness reads the source and prepares an isolated ignored `work/qa-access` copy. It pins SHA-256 hashes for the API and launcher, fails on unrecognised adapter anchors, and never edits the source. Its debug routes and synthetic provider exist only in this local harness; they are not production API routes. The harness blocks other outbound network calls.

Use `http://localhost:5197/_qa/login` for synthetic Staff Access and `http://127.0.0.1:5196` for People. Distinct hosts exercise cookie boundaries. Loopback HTTP is accepted only in explicit local development; hosted origins require HTTPS. Inspect only synthetic records. The actual prepared canonical Staff Access API is used, not a replacement broker implementation. Launcher ON/OFF assertions run on startup.

Current reviewed local Staff Access snapshot:
- API SHA-256: `9915f63c0af0bcacb3855aa67771ba5384925a079674353a53356a2211cd6a9e`
- Launcher SHA-256: `5608eee2c470244b4fb65699e2f92d4f779df151cefc0c0bddb73e75641a1605`

This identifies local source only, not an assertion about the deployed Staff Access revision. The companion still requires its own coordinated reviewed deployment. Re-prepare and re-certify if canonical source changes.

## Certification boundary and gates

Automated coverage includes default-OFF behavior; one-use, expiry, nonce, Origin, environment and subject controls; existing identity collision; binding-version revocation; membership/account/registry/grant revocation; provider rejection/timeout/logout; managed legacy bypass prevention; current People role/target/field/salary scope across all seven roles; Executive mutation/admin-GET denial; incomplete/missing accounts; transactional rollback; server-only preflight; expiry cleanup; and bound employee deletion. Existing Phase 0/Department/staff-cost/UI regressions also run.

Chrome checks cover same-tab and new-tab handoff, Executive Directory/profile/Skills/Organisation presentation, canonical launcher flag behavior, People → Staff Access logout and denial in another People tab on its next request. EN/ID and existing controls remain covered by the existing component suite. Local fixture measurements cannot certify hosted provider/network performance.

Isolated certification is not hosted or production certification. The Nallin project has no usable dedicated People QA branch: main is production; the existing Projects preview reports MIGRATIONS_FAILED and belongs to other work. Adam declined creating a paid branch and instructed use of existing resources. No branch was created and the Projects preview was not altered. Hosted provider/JWT/session behavior, actual runtime database privileges, migration/advisor results, distributed concurrency, production latency and cross-domain HTTPS cookie behavior remain NOT RUN. Do not mark those PASS based on PGlite/provider stubs or local HTTP.

Before any activation: complete hosted checks in an explicitly approved existing isolated environment, verify scheduled context cleanup/rate limiting/observability, reconcile deployed canonical Staff Access source and role allowlists, revalidate the private approved identity tuples and preserve a controlled rollback. Then request separate production activation approval. Adam's pilot and wider rollout remain separate approval gates. No live bindings or grants should be populated merely because this code or the preparation PR merges.

## Rollback

Disable handoff first. Keep platform enforcement ON for managed legacy identities so revoked users cannot regain entry through legacy login. Revoke existing local contexts and coordinate Staff Access launcher/registry exposure. Both flags OFF restores unmodified legacy authority and is therefore an explicit emergency security-policy rollback, not the normal disable path. Preserve additive binding/audit evidence; do not drop tables, regenerate employee IDs or reset passwords. Existing platform cookies cannot authenticate when entry is OFF; logout remains safe even after both flags are disabled.
