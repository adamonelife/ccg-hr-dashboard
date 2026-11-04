# People Staff Access staged implementation

## Approved direction — 4 November 2026

Adam approved the recommended audit package and explicitly confirmed Eshan's identity. The five exact real-staff candidates and Eshan may proceed to reviewed preparation. Exclude the test-adam/demo-client candidate. Preserve existing People roles: Adam remains Director, not People Administrator by virtue of platform SuperAdmin. No automatic employee, user, binding, grant or password creation.

QA first, then Adam as pilot. Production activation, live pilot entry and general rollout each remain separately approved gates. Approved identity details stay in the private audit/approval record, not this repository or seed migrations.

## Gate 1 — this change

- Add explicit reviewed-binding metadata with unique platform UUID and existing employee ID, organisation membership FK, reviewer/evidence requirements and versioned audit trail.
- Seed nothing. No existing employee/account/grant/module registry row changes.
- Inspect readiness by stable UUIDs only. Never match names, nicknames or emails at runtime.
- Approved binding means reviewed identity only. `readyForCertification` is NOT an entry permission, authentication result or issued session. The inspector does not check provider-session authentication, module entitlement, handoff replay/environment/state, or Executive ceilings; these are mandatory Gate 2/3 responsibilities.
- No HTTP route, login/session resolver, People policy, main UI, deployment environment or automatic schema prerequisite is changed. Current legacy schema verification continues to work before this optional migration exists.
- Migrations are explicit and local/QA-tested. No request handler performs DDL. No production migration or binding population is authorised by merging this development stage alone.

## Gate 2 — handoff implementation behind OFF-by-default flag

After Gate 1 review, add the canonical Staff Access broker adapter and People receiver, `PEOPLE_STAFF_ACCESS_ENABLED` default OFF, one-use browser-bound handoff, encrypted server-only context and existing hr_session integration. Pin audience `hr`, subject, organisation, environment, provider auth session and binding version. Keep tokens out of readable signed People cookies. Do not copy provider refresh tokens into People.

Do not activate the People registry/switcher entry before receiver, live validation and rollback controls are complete. Staff Access, deployed staff-admin and SuperAdmin role allowlists need coordinated changes; a registry row alone is insufficient.

## Gate 3 — certification, no cutover

Test the complete browser → broker → receiver → API chain with synthetic QA identities. Prove next-request live revocation for managed legacy and platform-origin sessions; zero Executive writes including side-effectful GETs; existing People role/target/field authority; provider logout; multi-tab/cross-user behaviour; wrong-environment/expired/replayed handoffs; incomplete onboarding; missing accounts; timeouts and rollback. Preserve Operations service-token salary access separately.

The first pilot preserves the existing People login-account requirement; missing-account users stay blocked. Setup remains required for ordinary entry. Executive incomplete-setup cases stay out of the pilot until separately resolved. On Leave/Notice Period preserve current semantics; Resigned/Terminated are denied.

## Gate 4 — Adam pilot, separate production activation approval

Revalidate the approved private identity tuple against live records. Stage only Adam's explicit binding/grant and use the existing CCG-005 record/Director role. Do not seed live IDs in migrations. Enable narrowly for the approved pilot only after QA passes and production activation is approved. Emergency bootstrap remains controlled fallback. An approved identity binding does not automatically grant module access.

## Gates 5/6 — separate rollout and retirement approvals

Add only explicitly reviewed cohorts/grants after the pilot succeeds. Keep legacy fallback. Consider legacy login/bootstrap retirement only under a later explicit approval.

## Rollback policy

Gate 1 has no runtime impact: leave its additive metadata inert or revert application code. Do not drop the tables/audit trail or touch employee/password data. Later disable handoff, revoke platform contexts, restore controlled legacy entry and coordinate registry/switcher configuration. Do not silently restore legacy access to platform-revoked managed users; any emergency exception must be explicit and time-bounded.

## Binding maintenance boundary

There is intentionally no binding mutation API or employee-admin control in Gate 1. Future reviewed tooling must authenticate/authorise a reviewer server-side, require the expected binding_version and approval reference, and populate changed_by from that verified reviewer. A People role is not platform grant-management authority. Database-owner SQL remains privileged; metadata constraints do not replace reviewer authorisation. Identity keys are immutable in this V1 table; replacing a mistaken/historical identity requires separately reviewed handling, not silent upsert or delete/recreate.


## Bound-record deletion gate

Gate 1 deliberately restricted referenced-record deletion. Gate 2 now resolves People employee deletion with atomic revocation/detachment, immutable original employee ID and preserved binding audit; failed deletion rolls everything back. The existing Administrator-only workflow and business-data cascades remain intact. Auth-user deletion still restricts historical binding references and requires separate reviewed platform lifecycle handling. See [handoff implementation and QA boundaries](handoff-qa.md). Neither isolated certification nor merging this code authorises live binding population or activation.

## Local verification

The repository has no automatic migration application. Apply this optional SQL explicitly only to the approved QA database first; its prerequisites are the existing auth.users, platform.memberships and People employees tables. The migration was exercised against PGlite using synthetic platform schema/identities, not a live Supabase branch. Run `node db/verify-people-bindings.mjs` against the intended QA database after migration; this preflight is read-only and separate from `npm run verify-schema`. Re-run provider-specific QA/advisors before any hosted migration is approved. The CLI migration filename was generated using the pinned Supabase CLI 3.0.0 with telemetry disabled.
