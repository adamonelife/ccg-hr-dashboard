import crypto from 'node:crypto';
import { getSql } from './db.mjs';

// Only current salary and existing Team assignments. No payroll or salary copy.
export function aggregateStaffCost(rows, units, now = new Date()) {
  const teams = new Set(units.filter(u => u.unit_type === 'Team').map(u => u.unit_name));
  const groups = new Map(), seen = new Set();
  for (const row of rows) {
    if (['Resigned', 'Terminated'].includes(row.employment_status)) continue;
    if (!row.employee_id || seen.has(row.employee_id)) throw new Error('Invalid or duplicate employee');
    seen.add(row.employee_id);
    const unit = teams.has(row.team) ? row.team : null;
    const key = unit || '__unassigned__';
    if (!groups.has(key)) groups.set(key, { unit, headcount: 0, salariesRecorded: 0, missingSalaryCount: 0, missingCurrencyCount: 0, amounts: new Map() });
    const group = groups.get(key); group.headcount++;
    const raw = row.current_salary;
    if (raw == null || String(raw).trim() === '' || !/^\d+(?:\.\d{1,2})?$/.test(String(raw))) { group.missingSalaryCount++; continue; }
    const cents = Math.round(Number(raw) * 100);
    if (!Number.isSafeInteger(cents)) throw new Error('Salary amount outside supported range');
    const currency = String(row.salary_currency || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) { group.missingCurrencyCount++; continue; }
    group.salariesRecorded++;
    const amount = group.amounts.get(currency) || { cents: 0, count: 0 };
    amount.cents += cents; amount.count++;
    if (!Number.isSafeInteger(amount.cents)) throw new Error('Salary total outside supported range');
    group.amounts.set(currency, amount);
  }
  const totals = new Map();
  const organisationUnits = [...groups.values()].map(group => {
    const currencies = [...group.amounts].map(([currency, amount]) => {
      const total = totals.get(currency) || { cents: 0, count: 0 };
      total.cents += amount.cents; total.count += amount.count;
      if (!Number.isSafeInteger(total.cents)) throw new Error('Salary total outside supported range');
      totals.set(currency, total);
      return { currency, knownMonthlyGrossSalary: amount.cents / 100, salariesRecorded: amount.count,
        averageRecordedGrossSalary: amount.count ? Math.round(amount.cents / amount.count) / 100 : null };
    });
    const { amounts, ...summary } = group;
    return { ...summary, complete: group.missingSalaryCount === 0 && group.missingCurrencyCount === 0, currencies };
  }).sort((a,b) => (a.unit || '\uffff').localeCompare(b.unit || '\uffff'));
  return { source: 'Nallin People current gross monthly salary', grouping: 'Existing People Team assignment',
    asOf: now.toISOString(), headcount: seen.size,
    salariesRecorded: organisationUnits.reduce((n,g) => n + g.salariesRecorded, 0),
    missingSalaryCount: organisationUnits.reduce((n,g) => n + g.missingSalaryCount, 0),
    missingCurrencyCount: organisationUnits.reduce((n,g) => n + g.missingCurrencyCount, 0),
    currencies: [...totals].map(([currency,a]) => ({ currency, knownMonthlyGrossSalary: a.cents / 100, salariesRecorded: a.count })),
    organisationUnits };
}

export async function handleStaffCost(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const environment = process.env.VERCEL_ENV || 'development';
  const secret = process.env.OPERATIONS_STAFF_COST_TOKEN;
  const provided = req.headers.authorization;
  if (!secret || secret.length < 32) return res.status(503).json({ error: 'Staff cost feed not configured' });
  const expected = Buffer.from('Bearer ' + secret), actual = Buffer.from(typeof provided === 'string' ? provided : '');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected) || req.headers['x-nallin-environment'] !== environment)
    return res.status(401).json({ error: 'Unauthorised cost feed' });
  try {
    const sql = getSql();
    const [rows, units] = await Promise.all([
      sql`SELECT employee_id, team, employment_status, current_salary, salary_currency FROM employees`,
      sql`SELECT unit_name, unit_type FROM org_units`,
    ]);
    return res.status(200).json(aggregateStaffCost(rows, units));
  } catch {
    return res.status(503).json({ error: 'People staff cost data unavailable; totals are incomplete' });
  }
}
