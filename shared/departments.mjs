// Fixed V1 operational registry. IDs are the cross-module contract; labels are presentation.
// Independent of employees.department, which remains the legacy org-unit reference.
export const DEPARTMENTS = [
  { id: 'landscape', name: 'Landscape' },
  { id: 'archviz', name: 'ArchViz' },
  { id: 'interactive', name: 'Interactive' },
  { id: 'pelago', name: 'Pelago' },
  { id: 'marketing', name: 'Marketing' },
  { id: 'sales', name: 'Sales' },
  { id: 'management', name: 'Management' },
];
export const departmentName = id => DEPARTMENTS.find(d => d.id === id)?.name || null;
