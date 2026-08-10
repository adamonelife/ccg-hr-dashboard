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

// For real file uploads (Documents' "upload a file" path) — deliberately
// no Content-Type header set here. The browser sets
// multipart/form-data; boundary=... itself when the body is a FormData
// instance, and setting it manually would drop the boundary and break
// parsing on the server (lib/multipart.mjs).
async function requestForm(path, formData) {
  const res = await fetch(`/api/${path}`, { method: 'POST', body: formData });
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
  getNextEmployeeId: () => request('employees?nextId=true'),
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
  moveOrgUnit: (unitName, newParentUnitName) =>
    request('org-units', {
      method: 'PATCH',
      body: JSON.stringify({ unit_name: unitName, parent_unit_name: newParentUnitName }),
    }),
  setOrgUnitOrder: (unitName, sortOrder) =>
    request('org-units', {
      method: 'PATCH',
      body: JSON.stringify({
        unit_name: unitName,
        sort_order: sortOrder === '' || sortOrder === null ? null : Number(sortOrder),
      }),
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

  leaveBalances: (employeeId) => request(`leave-balances?employeeId=${encodeURIComponent(employeeId)}`),
  setLeaveBalance: (data) => request('leave-balances', { method: 'POST', body: JSON.stringify(data) }),

  leaveRequests: (employeeId) => request(`leave-requests?employeeId=${encodeURIComponent(employeeId)}`),
  leaveApprovals: () => request('leave-requests?scope=approvals'),
  submitLeaveRequest: (data) => request('leave-requests', { method: 'POST', body: JSON.stringify(data) }),
  decideLeaveRequest: (id, status) =>
    request('leave-requests', { method: 'PATCH', body: JSON.stringify({ id, status }) }),

  // Personal documents — always scoped to one employee. addDocument is the
  // original "paste a Drive link" path (JSON); addDocumentWithFile is a
  // real upload (FormData — pick a file, it lands in that employee's
  // auto-created Drive folder). Both hit the same endpoint; the server
  // tells them apart by Content-Type.
  documents: (employeeId) => request(`documents?employeeId=${encodeURIComponent(employeeId)}`),
  addDocument: (data) => request('documents', { method: 'POST', body: JSON.stringify(data) }),
  addDocumentWithFile: (formData) => requestForm('documents', formData),
  deleteDocument: (id) => request(`documents?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Company-wide documents — folder + role-tier gated, not tied to any one
  // employee. GET only ever returns what the caller's role can see.
  companyDocuments: () => request('company-documents'),
  addCompanyDocument: (data) => request('company-documents', { method: 'POST', body: JSON.stringify(data) }),
  addCompanyDocumentWithFile: (formData) => requestForm('company-documents', formData),
  deleteCompanyDocument: (id) => request(`company-documents?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Self-service change requests — first-login setup gate + the permanent
  // HR-approval workflow for further self-edits. myChangeRequests is used
  // both to show "pending" status inline on the Employee Card/Form and by
  // the review queue's own employee-scoped drill-in; changeRequestQueue is
  // the flat Pending list for Administrator/HR/Director; decideChangeRequest
  // approves/rejects one.
  myChangeRequests: (employeeId) => request(`change-requests?employeeId=${encodeURIComponent(employeeId)}`),
  changeRequestQueue: () => request('change-requests?scope=queue'),
  decideChangeRequest: (id, status, reviewNotes) =>
    request('change-requests', {
      method: 'PATCH',
      body: JSON.stringify({ id, status, review_notes: reviewNotes || undefined }),
    }),
};
