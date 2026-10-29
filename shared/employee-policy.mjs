export const EMPLOYEE_FIELDS = [
  'employee_id',
  'full_name',
  'nickname',
  'photo_url',
  'email',
  'phone',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
  'date_of_birth',
  'nationality',
  'religion',
  'gender',
  'marital_status',
  'number_of_children',
  'ktp_number',
  'bni_account_number',
  'employment_status',
  'start_date',
  'end_date',
  'company',
  'department',
  'job_title',
  'team',
  'manager_id',
  'office_location',
  'employment_type',
  'contract_type',
  'contract_start',
  'contract_end',
  'probation_end_date',
  'current_salary',
  'salary_currency',
  'bonus_eligible',
  'kitas_expiry',
  'passport_expiry',
  'work_permit_expiry',
  'permission_role',
];

export const SELF_SERVICE_FIELDS = [
  'nickname',
  'photo_url',
  'phone',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
  'nationality',
  'date_of_birth',
  'religion',
  'gender',
  'marital_status',
  'number_of_children',
  'office_location',
];

export const PEOPLE_ROLES = ['Employee', 'Team Lead', 'Main Lead', 'HR', 'Finance', 'Director', 'Administrator'];
export const PROFILE_MANAGEMENT_ROLES = ['Administrator', 'Director', 'HR', 'Finance'];
export const SALARY_ROLES = ['Administrator', 'HR', 'Finance'];
export const PROMOTION_ROLES = ['Administrator', 'HR'];

// Visibility is checked separately on the server. No platform-role translation.
export function editableEmployeeFields(session, employeeId) {
  if (session?.role === 'Administrator') return EMPLOYEE_FIELDS.filter(k => k !== 'employee_id');
  if (PROFILE_MANAGEMENT_ROLES.includes(session?.role)) {
    return EMPLOYEE_FIELDS.filter(k => !['employee_id', 'permission_role'].includes(k));
  }
  return session?.employee_id === employeeId ? [...SELF_SERVICE_FIELDS] : [];
}

export const COMPENSATION_FIELDS = ['current_salary', 'salary_currency', 'bonus_eligible', 'bni_account_number'];
export function canViewCompensation(session, employeeId) {
  return PROFILE_MANAGEMENT_ROLES.includes(session?.role) || Boolean(session?.employee_id && session.employee_id === employeeId);
}
