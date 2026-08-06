import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function OrgChart() {
  const [tree, setTree] = useState([]);
  const [reportingLines, setReportingLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .orgChart()
      .then((data) => {
        setTree(data.tree || []);
        setReportingLines(data.reportingLines || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={styles.error}>{error}</p>;

  return (
    <div>
      <h2>Organisation structure</h2>
      {tree.length === 0 && (
        <p style={styles.hint}>
          No org units defined yet — add rows to the <code>OrgUnits</code> tab (see SETUP.md).
        </p>
      )}
      {tree.map((node) => (
        <TreeNode key={node.name} node={node} depth={0} />
      ))}

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

function TreeNode({ node, depth }) {
  return (
    <div style={{ marginLeft: depth * 24, marginBottom: 8 }}>
      <div style={styles.nodeLabel}>
        <span style={styles.nodeType}>{node.type}</span> {node.name}
      </div>
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
        <TreeNode key={child.name} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

const styles = {
  nodeLabel: { fontWeight: 600 },
  nodeType: { fontSize: 11, color: '#888', textTransform: 'uppercase', marginRight: 6 },
  memberList: { margin: '4px 0 0 20px', fontSize: 14, color: '#333' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ddd', color: '#555' },
  td: { padding: '8px 10px', borderBottom: '1px solid #eee' },
  hint: { color: '#666', fontSize: 14 },
  error: { color: '#c00' },
};
