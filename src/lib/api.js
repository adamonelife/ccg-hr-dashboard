// src/lib/api.js — thin fetch wrapper for the /api/* routes.

async function request(path, opts = {}) {
  const res = await fetch(`/api/${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  me: () => request('auth/me'),
  // Leave email blank/undefined for the master-admin bootstrap login.
  login: (password, email) =>
    request('auth/login', { method: 'POST', body: JSON.stringify({ password, email: email || undefined }) }),
  logout: () => request('auth/logout', { method: 'POST' }),
  setPassword: (token, password) =>
    request('auth/set-password', { method: 'POST', body: JSON.stringify({ token, password }) }),

  getAccountStatus: (employeeId) => request(`admin/accounts?employeeId=${encodeURIComponent(employeeId)}`),
  createAccount: (employeeId, email) =>
    request('admin/accounts', { method: 'POST', body: JSON.stringify({ employee_id: employeeId, email }) }),

  listEmployees: (includeInactive = false) =>
    request(`employees${includeInactive ? '?includeInactive=true' : ''}`),
  getEmployee: (id) => request(`employees?id=${encodeURIComponent(id)}`),
  createEmployee: (data) => request('employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (data) => request('employees', { method: 'PATCH', body: JSON.stringify(data) }),
  deleteEmployee: (id) => request(`employees?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  orgChart: () => request('org-chart'),
  orgUnits: () => request('org-units'),
  createOrgUnit: (data) => request('org-units', { method: 'POST', body: JSON.stringify(data) }),
  assignOrgUnitLead: (unitName, leadEmployeeId) =>
    request('org-units', {
      method: 'PATCH',
      body: JSON.stringify({ unit_name: unitName, lead_employee_id: leadEmployeeId }),
    }),
  deleteOrgUnit: (unitName) => request(`org-units?unit_name=${encodeURIComponent(unitName)}`, { method: 'DELETE' }),

  salaryHistory: (employeeId) => request(`salary-history?employeeId=${encodeURIComponent(employeeId)}`),
  addSalaryEntry: (data) => request('salary-history', { method: 'POST', body: JSON.stringify(data) }),

  promotionHistory: (employeeId) =>
    request(`promotion-history?employeeId=${encodeURIComponent(employeeId)}`),
  addPromotionEntry: (data) => request('promotion-history', { method: 'POST', body: JSON.stringify(data) }),

  skills: (employeeId) => request(`skills?employeeId=${encodeURIComponent(employeeId)}`),
  addSkillEntry: (data) => request('skills', { method: 'POST', body: JSON.stringify(data) }),
  updateSkillEntry: (data) => request('skills', { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSkillEntry: (id) => request(`skills?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
