// Stage 1 inspection only. NOT authentication or permission middleware.
// No production route imports this module. Never resolve identities by email.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import {PEOPLE_ROLES} from '../shared/employee-policy.mjs';
const VALID_ROLES = new Set(PEOPLE_ROLES);

export async function inspectPeopleBinding(sql, { platformUserId, organisationId }) {
  if (!UUID.test(platformUserId || '') || !UUID.test(organisationId || '')) {
    return { status: 'invalid_identity', readyForCertification: false };
  }
  const [row] = await sql`
    SELECT b.employee_id, b.review_status, b.binding_version,
      e.permission_role, e.employment_status, e.profile_setup_completed_at,
      ua.employee_id IS NOT NULL AND ua.password_hash IS NOT NULL AS legacy_account_ready,
      ib.auth_user_id IS NOT NULL AS internal_identity_bound,
      m.active AS membership_active, coalesce(ac.status,'active') AS platform_account_status
    FROM platform.people_identity_bindings b
    JOIN public.employees e ON e.employee_id=b.employee_id
    LEFT JOIN public.user_accounts ua ON ua.employee_id=e.employee_id
    LEFT JOIN platform.internal_identity_bindings ib
      ON ib.auth_user_id=b.auth_user_id AND ib.organisation_id=b.organisation_id
    LEFT JOIN platform.memberships m
      ON m.user_id=b.auth_user_id AND m.organisation_id=b.organisation_id
    LEFT JOIN platform.account_controls ac ON ac.user_id=b.auth_user_id
    WHERE b.auth_user_id=${platformUserId} AND b.organisation_id=${organisationId}
  `;
  if (!row) return { status: 'binding_missing', readyForCertification: false };
  const result = { employeeId: row.employee_id, bindingVersion: String(row.binding_version), readyForCertification: false };
  if (row.review_status !== 'approved') return { ...result, status: row.review_status === 'revoked' ? 'binding_revoked' : 'binding_review_required' };
  if (!row.internal_identity_bound || !row.membership_active || row.platform_account_status !== 'active') {
    return { ...result, status: 'platform_identity_ineligible' };
  }
  if (['Resigned','Terminated'].includes(row.employment_status) || !VALID_ROLES.has(row.permission_role)) {
    return { ...result, status: 'people_employee_ineligible' };
  }
  // Preserve current account requirement for the first pilot. Missing-account
  // passwordless eligibility is a separate phase; never manufacture credentials.
  if (!row.legacy_account_ready) return { ...result, status: 'people_account_ineligible' };
  return { ...result, status: 'binding_ready', readyForCertification: true,
    peopleRole: row.permission_role, profileSetupComplete: Boolean(row.profile_setup_completed_at) };
}
