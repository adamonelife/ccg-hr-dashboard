import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const UNIT_TYPES = ['Group', 'Company', 'Department', 'Team'];

// Matches lib/org.mjs's MUTATE_ROLES — create/assign-lead/delete are all
// gated the same way. Kept as a plain array here (UI-only convenience);
// the actual enforcement is server-side.
const CAN_MANAGE_ORG_UNITS = ['Administrator', 'Director'];

export default function OrgChart({ role }) {
  const canManage = CAN_MANAGE_ORG_UNITS.includes(role);
  const [tree, setTree] = useState([]);
  const [reportingLines, setReportingLines] = useState([]);
  const [units, setUnits] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    setError('');
    // Active employees only — makes more sense as the pool of possible
    // leads than including people who've left.
    Promise.all([api.orgChart(), api.orgUnits(), api.listEmployees()])
      .then(([chartData, unitData, empData]) => {
        setTree(chartData.tree || []);
        setReportingLines(chartData.reportingLines || []);
        setUnits(unitData.units || []);
        setEmployees(empData.employees || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={styles.error}>{error}</p>;

  return (
    <div>
      <h2>Organisation structure</h2>
      {tree.length === 0 && <p style={styles.hint}>No org units defined yet — add one below.</p>}
      {tree.map((node) => (
        <TreeNode
          key={node.name}
          node={node}
          depth={0}
          employees={employees}
          units={units}
          canManage={canManage}
          onChanged={load}
        />
      ))}

      {canManage && <AddUnitForm units={units} employees={employees} onAdded={load} />}

      <h2 style={{ marginTop: 32 }}>Reporting lines</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Employee</th>
            <th style={styles.th}>Title</th>
            <th style={styles.th}>Reports to</th>
          </tr>
        </thead>
        <tbody>
          {reportingLines.map((r) => (
            <tr key={r.employee_id}>
              <td style={styles.td}>{r.nickname || r.full_name}</td>
              <td style={styles.td}>{r.job_title}</td>
              <td style={styles.td}>{r.manager_nickname || r.manager_name || r.manager_id}</td>
            </tr>
          ))}
          {reportingLines.length === 0 && (
            <tr>
              <td style={styles.td} colSpan={3}>
                No reporting lines yet — set manager_id on employee records.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TreeNode({ node, depth, employees, units, canManage, onChanged }) {
  const [assigning, setAssigning] = useState(false);
  const [leadId, setLeadId] = useState(node.lead_employee_id || '');
  const [moving, setMoving] = useState(false);
  const [newParent, setNewParent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSaveLead(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.assignOrgUnitLead(node.name, leadId || null);
      setAssigning(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.moveOrgUnit(node.name, newParent || null);
      setMoving(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${node.name}"? This only works if it has no sub-units under it.`)) return;
    setSaving(true);
    setError('');
    try {
      await api.deleteOrgUnit(node.name);
      onChanged();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  // Everything else in org_units except this node itself and anything
  // this node is already an ancestor of — the server re-checks this too
  // (can't move a unit under its own sub-unit), but filtering it out here
  // keeps the dropdown from offering an obviously-invalid choice.
  const moveOptions = (units || []).filter((u) => u.unit_name !== node.name);

  return (
    <div style={{ marginLeft: depth * 24, marginBottom: 8 }}>
      <div style={styles.nodeRow}>
        <div style={styles.nodeLabel}>
          <span style={styles.nodeType}>{node.type}</span> {node.name}
          {node.lead_name && <span style={styles.leadTag}> · Lead: {node.lead_name}</span>}
        </div>
        {canManage && (
          <span style={styles.nodeActions}>
            <button onClick={() => setAssigning((v) => !v)} style={styles.rowButton}>
              {node.lead_name ? 'Change lead' : 'Assign lead'}
            </button>
            <button onClick={() => setMoving((v) => !v)} style={styles.rowButton}>
              Move
            </button>
            <button onClick={handleDelete} disabled={saving} style={styles.rowButton}>
              Delete
            </button>
          </span>
        )}
      </div>

      {canManage && assigning && (
        <form onSubmit={handleSaveLead} style={styles.inlineForm}>
          <select value={leadId} onChange={(e) => setLeadId(e.target.value)} style={styles.select}>
            <option value="">— none —</option>
            {employees.map((emp) => (
              <option key={emp.employee_id} value={emp.employee_id}>
                {emp.nickname || emp.full_name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={saving} style={styles.addButton}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setAssigning(false)} style={styles.cancelButton}>
            Cancel
          </button>
        </form>
      )}

      {canManage && moving && (
        <form onSubmit={handleMove} style={styles.inlineForm}>
          <select value={newParent} onChange={(e) => setNewParent(e.target.value)} style={styles.select}>
            <option value="">— top level —</option>
            {moveOptions.map((u) => (
              <option key={u.unit_name} value={u.unit_name}>
                {u.unit_name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={saving} style={styles.addButton}>
            {saving ? 'Moving…' : 'Move here'}
          </button>
          <button type="button" onClick={() => setMoving(false)} style={styles.cancelButton}>
            Cancel
          </button>
        </form>
      )}
      {error && <p style={styles.error}>{error}</p>}

      {node.members?.length > 0 && (
        <ul style={styles.memberList}>
          {node.members.map((m) => (
            <li key={m.employee_id}>
              {m.nickname || m.full_name} — {m.job_title}
            </li>
          ))}
        </ul>
      )}
      {node.children?.map((child) => (
        <TreeNode
          key={child.name}
          node={child}
          depth={depth + 1}
          employees={employees}
          units={units}
          canManage={canManage}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function AddUnitForm({ units, employees, onAdded }) {
  const [unitName, setUnitName] = useState('');
  const [unitType, setUnitType] = useState('Team');
  const [parentUnitName, setParentUnitName] = useState('');
  const [leadId, setLeadId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!unitName.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.createOrgUnit({
        unit_name: unitName,
        unit_type: unitType,
        parent_unit_name: parentUnitName || null,
        lead_employee_id: leadId || null,
      });
      setUnitName('');
      setParentUnitName('');
      setLeadId('');
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.addUnitPanel}>
      <h3 style={styles.sectionTitle}>Add company / department / team</h3>
      <form onSubmit={handleSubmit} style={styles.inlineForm}>
        <input
          placeholder="Name (e.g. RT3D, Creative, Concepts Conveyed Group)"
          value={unitName}
          onChange={(e) => setUnitName(e.target.value)}
          style={{ ...styles.select, flex: 2 }}
        />
        <select value={unitType} onChange={(e) => setUnitType(e.target.value)} style={styles.select}>
          {UNIT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={parentUnitName} onChange={(e) => setParentUnitName(e.target.value)} style={styles.select}>
          <option value="">— top level —</option>
          {units.map((u) => (
            <option key={u.unit_name} value={u.unit_name}>
              {u.unit_name}
            </option>
          ))}
        </select>
        <select value={leadId} onChange={(e) => setLeadId(e.target.value)} style={styles.select}>
          <option value="">— no lead yet —</option>
          {employees.map((emp) => (
            <option key={emp.employee_id} value={emp.employee_id}>
              {emp.nickname || emp.full_name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={saving} style={styles.addButton}>
          {saving ? 'Adding…' : 'Add'}
        </button>
      </form>
      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

const styles = {
  nodeRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nodeLabel: { fontWeight: 600 },
  nodeType: { fontSize: 11, color: '#888', textTransform: 'uppercase', marginRight: 6 },
  leadTag: { fontWeight: 400, fontSize: 13, color: '#555' },
  nodeActions: { display: 'flex', gap: 6, flexShrink: 0 },
  rowButton: {
    padding: '3px 8px',
    fontSize: 12,
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
  },
  memberList: { margin: '4px 0 0 20px', fontSize: 14, color: '#333' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ddd', color: '#555' },
  td: { padding: '8px 10px', borderBottom: '1px solid #eee' },
  hint: { color: '#666', fontSize: 14 },
  error: { color: '#c00' },
  inlineForm: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 },
  select: { padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 4 },
  addButton: {
    padding: '6px 14px',
    fontSize: 13,
    border: 'none',
    borderRadius: 4,
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
  cancelButton: {
    padding: '6px 14px',
    fontSize: 13,
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer',
  },
  addUnitPanel: { marginTop: 24, borderTop: '1px solid #eee', paddingTop: 16 },
  sectionTitle: { fontSize: 14, margin: '0 0 8px 0' },
};
