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
  login: (password) => request('auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request('auth/logout', { method: 'POST' }),

  listEmployees: (includeInactive = false) =>
    request(`employees${includeInactive ? '?includeInactive=true' : ''}`),
  getEmployee: (id) => request(`employees?id=${encodeURIComponent(id)}`),
  createEmployee: (data) => request('employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (data) => request('employees', { method: 'PATCH', body: JSON.stringify(data) }),

  orgChart: () => request('org-chart'),
  orgUnits: () => request('org-units'),

  salaryHistory: (employeeId) => request(`salary-history?employeeId=${encodeURIComponent(employeeId)}`),
  addSalaryEntry: (data) => request('salary-history', { method: 'POST', body: JSON.stringify(data) }),

  promotionHistory: (employeeId) =>
    request(`promotion-history?employeeId=${encodeURIComponent(employeeId)}`),
  addPromotionEntry: (data) => request('promotion-history', { method: 'POST', body: JSON.stringify(data) }),
};
