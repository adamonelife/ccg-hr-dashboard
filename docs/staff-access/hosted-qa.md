# Nallin People — hosted Staff Access QA

4 November 2026. Functional/security certification: PASS. Activation readiness: HOLD for performance and production operational gates. Production, Adam pilot and rollout remain OFF and separately approved. No paid branch/project was created.

## Environment and evidence

Used the expressly approved existing Supabase preview xbaiwwykrdoalgtandli and existing Vercel QA projects. Seven synthetic identities, two synthetic organisations; no real employee data or credentials used. Applied the additive People baseline and two integration migrations only to preview. Cross-domain HTTPS browser tests used actual canonical Staff Access source and actual Supabase Auth, not the local mock provider.

Final hosted People candidate: dpl_FMoHcLbBriomkqcJa7jSkkw12Rsd. Canonical companion: dpl_EP1KPb6JELW1G2mXiHYGhZBy6ZwJ. Both proper Preview deployments with Vercel Authentication retained. Exact source hashes are in handoff-qa.md. SDK uses current per-request OIDC, restricted during QA to same-project Preview calls.

## Hosted matrix

| Case | Result | Evidence |
|---|---|---|
| role:Administrator | PASS | {&quot;role&quot;:&quot;Administrator&quot;,&quot;currentRole&quot;:true,&quot;targetScope&quot;:true,&quot;salaryPermission&quot;:true,&quot;privilegedRoleEscalationDenied&quot;:false} |
| role:Director | PASS | {&quot;role&quot;:&quot;Director&quot;,&quot;currentRole&quot;:true,&quot;targetScope&quot;:true,&quot;salaryPermission&quot;:true,&quot;privilegedRoleEscalationDenied&quot;:true} |
| role:HR | PASS | {&quot;role&quot;:&quot;HR&quot;,&quot;currentRole&quot;:true,&quot;targetScope&quot;:true,&quot;salaryPermission&quot;:true,&quot;privilegedRoleEscalationDenied&quot;:true} |
| role:Finance | PASS | {&quot;role&quot;:&quot;Finance&quot;,&quot;currentRole&quot;:true,&quot;targetScope&quot;:true,&quot;salaryPermission&quot;:true,&quot;privilegedRoleEscalationDenied&quot;:true} |
| role:Main Lead | PASS | {&quot;role&quot;:&quot;Main Lead&quot;,&quot;currentRole&quot;:true,&quot;targetScope&quot;:true,&quot;salaryPermission&quot;:true,&quot;privilegedRoleEscalationDenied&quot;:true} |
| role:Team Lead | PASS | {&quot;role&quot;:&quot;Team Lead&quot;,&quot;currentRole&quot;:true,&quot;targetScope&quot;:true,&quot;salaryPermission&quot;:true,&quot;privilegedRoleEscalationDenied&quot;:true} |
| role:Employee | PASS | {&quot;role&quot;:&quot;Employee&quot;,&quot;currentRole&quot;:true,&quot;targetScope&quot;:true,&quot;salaryPermission&quot;:true,&quot;privilegedRoleEscalationDenied&quot;:true} |
| smoke | PASS | {&quot;schema&quot;:true,&quot;unauthenticatedDenied&quot;:true,&quot;role&quot;:&quot;Director&quot;} |
| executive | PASS | {&quot;canonicalMembershipCeiling&quot;:true,&quot;legacyCeiling&quot;:true} |
| nonce_replay | PASS | {&quot;nonce&quot;:true,&quot;origin&quot;:true,&quot;replay&quot;:true,&quot;expiry&quot;:true,&quot;environment&quot;:true} |
| cross_identity | PASS | {&quot;differentPersonDenied&quot;:true,&quot;bootstrapNotReplaced&quot;:true} |
| revoke_grant | PASS | {&quot;platformAndLegacyRevoked&quot;:true} |
| revoke_membership | PASS | {&quot;membershipRechecked&quot;:true} |
| revoke_account | PASS | {&quot;canonicalSuspensionRechecked&quot;:true} |
| provider_logout | PASS | {&quot;realProviderLogout&quot;:true,&quot;invalidSignatureDenied&quot;:true} |
| context_logout | PASS | {&quot;localContextRevoked&quot;:true,&quot;canonicalLogoutTarget&quot;:true} |
| binding | PASS | {&quot;bindingVersionInvalidatesBoth&quot;:true} |
| scope | PASS | {&quot;leadScope&quot;:true,&quot;protectedSalaryOmitted&quot;:true,&quot;noGrantDenied&quot;:true,&quot;otherOrganisationDenied&quot;:true} |
| concurrency | PASS | {&quot;concurrentReplaySuccesses&quot;:1,&quot;replays&quot;:8,&quot;concurrentReads&quot;:5,&quot;maxReadMs&quot;:4785} |
| read_surfaces | PASS | {&quot;times&quot;:[{&quot;route&quot;:&quot;employees&quot;,&quot;ms&quot;:2886,&quot;bytes&quot;:1799},{&quot;route&quot;:&quot;employees&quot;,&quot;ms&quot;:3515,&quot;bytes&quot;:1732},{&quot;route&quot;:&quot;org-chart&quot;,&quot;ms&quot;:3262,&quot;bytes&quot;:529},{&quot;route&quot;:&quot;org-units&quot;,&quot;ms&quot;:2970,&quot;bytes&quot;:222},{&quot;route&quot;:&quot;leave-requests&quot;,&quot;ms&quot;:3090,&quot;bytes&quot;:15},{&quot;route&quot;:&quot;leave-balances&quot;,&quot;ms&quot;:3400,&quot;bytes&quot;:279},{&quot;route&quot;:&quot;documents&quot;,&quot;ms&quot;:3070,&quot;bytes&quot;:16},{&quot;route&quot;:&quot;company-documents&quot;,&quot;ms&quot;:2864,&quot;bytes&quot;:16},{&quot;route&quot;:&quot;change-requests&quot;,&quot;ms&quot;:2875,&quot;bytes&quot;:15}]} |
| data_api | PASS | {&quot;anonymousAndAuthenticatedDirectAccessDenied&quot;:true} |
| transaction_failure | PASS | {&quot;distributedPrecommitRevocation&quot;:true,&quot;businessWriteRolledBack&quot;:true,&quot;bindingAndAuditRolledBack&quot;:true} |
| bound_delete_rollback | PASS | {&quot;distributedPrecommitRevocation&quot;:true,&quot;businessWriteRolledBack&quot;:true,&quot;bindingAndAuditRolledBack&quot;:true} |
| stale_cookie | PASS | {&quot;revokedCookieDoesNotBlockFreshIdentity&quot;:true} |
| incomplete_account | PASS | {&quot;missingAccountHashDenied&quot;:true,&quot;ordinarySetupPreserved&quot;:true,&quot;executiveIncompleteDenied&quot;:true} |
| cleanup_contexts | PASS | {&quot;expiredRemoved&quot;:26,&quot;bindingAuditRetained&quot;:true} |
| bound_self_delete | PASS | {&quot;administratorSelfDeletion&quot;:true,&quot;auditRetained&quot;:true,&quot;employeeIdReuseDenied&quot;:true} |

28 distinct serial direct-HTTPS cases passed. Two earlier harness failures are retained in http-results.json: lead visibility fixture initially omitted the existing org-unit hierarchy; read-surface calls initially omitted the required employeeId parameter. Corrected the harness/fixtures and reran successfully. Existing People business permissions were not relaxed. An earlier overlapping cloud-role harness run was discarded and replaced by serial role tests.

## Chrome checks

| Check | Result |
|---|---|
| Synthetic Staff Access sign-in → People | PASS |
| New-tab handoff | PASS |
| Executive Directory, read-first profile, disabled Skills controls | PASS |
| Executive Organisation and EN/ID | PASS |
| People → canonical Staff Access logout | PASS |
| Second People tab denied on next request after logout | PASS |
| Executive grant revoked → login on next request | PASS |

The QA Executive fixture retained its existing Director People role. Canonical executive membership capped it to read-only; no Executive-to-Director mapping was added. No fake module switcher was activated.

## Corrections made

- Enforce canonical executive membership as a read-only ceiling even if its module grant is ADMIN/people.
- Broker uses @vercel/oidc 4.0.6 per-request tokens, never a captured build token.
- Canonical companion can return an independently verified People-only entitlement when the unrelated staff-admin access service is unavailable. It receives the provider-validated UUID from People and grants no other module. OFF preserves original behavior.
- Ignore signed cookies only when their old identity is locally proven dead; keep active other-user/bootstrap collision denial. Database errors still fail closed. This resolved fresh handoff after logout; hosted stale-cookie and active collision cases both pass.

## Representative performance

Same candidate, DB, synthetic fixture set, iad1 region and serial client. OFF means both flags disabled with legacy login; ON means real provider/session/grant checks. One representative sample per endpoint; no claim of production capacity or statistical improvement. Timings include network transit.

| API | OFF ms | ON ms | Delta ms | ON bytes |
|---|---:|---:|---:|---:|
| employees | 846 | 2886 | +2040 | 1799 |
| employees | 1020 | 3515 | +2495 | 1732 |
| org-chart | 2405 | 3262 | +857 | 529 |
| org-units | 1115 | 2970 | +1855 | 222 |
| leave-requests | 1038 | 3090 | +2052 | 15 |
| leave-balances | 1392 | 3400 | +2008 | 279 |
| documents | 1029 | 3070 | +2041 | 16 |
| company-documents | 931 | 2864 | +1933 | 16 |
| change-requests | 885 | 2875 | +1990 | 15 |

**Performance: HOLD.** Most reads gained about 2 seconds. Do not remove fresh authorization checks or cache stale permissions to improve this. Profile sequential DB/provider round trips and deployment/database region placement, then repeat comparison before pilot/activation. Static build remains 262.38 kB JS (75.49 kB gzip), 23.58 kB CSS (4.97 kB gzip); no new UI bundle dependency. No comparable measured full-browser useful-content baseline was captured, so none is claimed.

## Security/advisors

Data API employee reads denied to anonymous and signed-in synthetic users. Server-only RLS and grants verified. All seven People roles, target restrictions, salary history permissions, escalation denial, Executive write/admin-GET denial, provider logout, nonce/origin/replay/expiry/environment, binding version, grant/membership/account revocation, concurrency, transaction rollback and deletion/ID reuse passed. No normal-request schema DDL was introduced.

Supabase security advisor: no new WARN/ERROR from People tables. Server-only RLS with no browser policies is intentional deny-all. Existing leaked-password-protection warning remains unchanged: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. Performance advisor has informational FK-index/unused-index notices (including binding reviewer/actor FKs); profile before adding indexes. Shared Auth/other-module settings were not altered.

## Cleanup and safety

Verified cleanup: {"employees": 0, "provider_sessions": 0, "active_grants": 0, "approved_bindings": 0, "retained_audit": 22, "syntheticAuthUsersBanned": 7, "registryRestored": true, "protectedSchemasUnchanged": true, "verifiedAt": "2026-11-04T10:03:04.980Z"}

Seven synthetic Auth users are banned; provider sessions revoked/deleted. Synthetic employee rows and their accounts removed; QA org unit removed. Bindings revoked/detached and immutable audit retained. Synthetic organisations/identities retained as inactive audit references; Auth-user hard deletion remains restricted by history. Preview People registry restored to registered_future. Existing Projects/Integrations/int_platform/int_secrets row counts and hashes match the captured baseline exactly. Both original stable and generated QA aliases point to their original deployments.

Temporary Vercel OIDC disabled again; trusted-source rule reset to original defaults. All 24 newly added temporary environment values cleared/disabled (seven non-sensitive keys renamed RETIRED_PEOPLE_QA_*; sensitive keys cannot be renamed by Vercel and are empty). Original variables were not changed. Immutable historical QA deployments remain private and inert through revoked synthetic grants/accounts and registry; they retain deployment-time configuration snapshots. No shared DB credential was rotated.

## Remaining activation gates

- Resolve and remeasure the observed latency increase.
- Separately configure/verify scheduled context cleanup, rate limits and operational monitoring for the intended activation environment. Operator cleanup itself passed hosted QA; no production cron/firewall was installed.
- Reconcile the reviewed companion with current deployed canonical Staff Access, production origins/protection trust and role allowlists; revalidate approved private identity tuples.
- Obtain separate production activation approval, then separate Adam pilot and rollout approval.

204 automated regressions and production build pass. Draft PR #12 remains unmerged. No production schema, bindings, grants, environment, authentication deployment or pilot changed.
