// Aggregate-only projection. No employee identifier or individual compensation leaves People.
export function aggregateCostHierarchy(rows, departments, teams, now = new Date()) {
  const registry = new Map(departments.map(d => [d.id, d]));
  if (registry.size !== departments.length) throw new Error('Duplicate Department');
  for (const d of departments) if (!['production','non_production',null].includes(d.production_classification)) throw new Error('Invalid classification');
  const teamNames = new Set(teams.map(t => t.unit_name));
  const cells = new Map(), seen = new Set();
  for (const row of rows) {
    if (['Resigned','Terminated'].includes(row.employment_status)) continue;
    if (!row.employee_id || seen.has(row.employee_id)) throw new Error('Duplicate employee');
    seen.add(row.employee_id);
    // People currently has no Company ID registry: retain the exact source value,
    // explicitly labelled as a legacy key. Never fuzzy-match or join by this label.
    const company = typeof row.company === 'string' && row.company.trim() ? row.company : null;
    if (row.department_id && !registry.has(row.department_id)) throw new Error('Unknown Department ID');
    const department = registry.get(row.department_id) || null;
    const team = teamNames.has(row.team) ? row.team : null;
    const key = JSON.stringify([company,department?.id || null,team]);
    if (!cells.has(key)) cells.set(key, {
      company_id: company === null ? null : `people-company:${company}`, company_name: company,
      department_id: department?.id || null, department_name: department?.name || null,
      production_classification: department?.production_classification || null,
      team_id: team === null ? null : `people-team:${team}`, team_name: team,
      headcount:0, salariesRecorded:0, missingSalaryCount:0, missingCurrencyCount:0, currencies:new Map(),
    });
    const cell = cells.get(key); cell.headcount++;
    const raw = row.current_salary;
    if (raw == null || !/^\d+(?:\.\d{1,2})?$/.test(String(raw))) { cell.missingSalaryCount++; continue; }
    const cents = Math.round(Number(raw) * 100);
    if (!Number.isSafeInteger(cents)) throw new Error('Unsupported salary range');
    const currency = String(row.salary_currency || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) { cell.missingCurrencyCount++; continue; }
    cell.salariesRecorded++;
    const amount = cell.currencies.get(currency) || { cents:0, salariesRecorded:0 };
    amount.cents += cents; amount.salariesRecorded++;
    if (!Number.isSafeInteger(amount.cents)) throw new Error('Unsupported total');
    cell.currencies.set(currency, amount);
  }
  return {
    version:2, source:'Nallin People', asOf:now.toISOString(),
    identityNotes:{ company:'Exact People company field; legacy key, no durable Company registry yet', team:'Existing People org-unit primary key; unchanged' },
    departments:departments.map(d=>({department_id:d.id,department_name:d.name,production_classification:d.production_classification})),
    cells:[...cells.values()].map(cell=>({...cell,currencies:[...cell.currencies].map(([currency,a])=>({currency,knownMonthlyGrossSalary:a.cents/100,salariesRecorded:a.salariesRecorded}))})),
  };
}
