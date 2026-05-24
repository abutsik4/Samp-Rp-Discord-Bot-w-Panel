import { SectionCard } from "../../components/SectionCard";
import { Alert } from "../../components/Alert";
import { EmptyState } from "../../components/EmptyState";
import { Star, Save, Trash2, Plus, Users } from "lucide-react";

export function BoostsTab({
  xpMultipliers, xpError, xpSuccess, xpForm, setXpForm,
  roles, rolesError, roleForm, setRoleForm, roleSuccess, roleError,
  upsertXpMultiplier, deleteXpMultiplier, createRole,
}) {
  return (
    <>
      <SectionCard title="XP Multipliers" icon={Star} description="Highest multiplier among user's roles wins. 1.2 = +20% XP per message.">
        {xpError && <Alert type="error">{xpError}</Alert>}
        {xpSuccess && <Alert type="success">{xpSuccess}</Alert>}
        {rolesError && <Alert type="warning">Roles: {rolesError}</Alert>}
        <div className="row-actions mb-4">
          <select value={xpForm.roleId} onChange={(e) => setXpForm((p) => ({ ...p, roleId: e.target.value }))}>
            <option value="">Select role</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input
            placeholder="Multiplier (e.g. 1.5)"
            type="number" step="0.05" min="0" max="10"
            value={xpForm.multiplier}
            onChange={(e) => setXpForm((p) => ({ ...p, multiplier: Number(e.target.value) }))}
          />
          <button onClick={() => upsertXpMultiplier(xpForm)}>
            <Save size={13} /> Save
          </button>
        </div>
        {xpMultipliers.length === 0 ? (
          <EmptyState icon={Star} title="No multipliers set" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Role</th><th>Multiplier</th><th></th></tr></thead>
              <tbody>
                {xpMultipliers.map((x) => (
                  <tr key={x.role_id}>
                    <td>{roles.find((r) => r.id === x.role_id)?.name || x.role_id}</td>
                    <td>{x.multiplier}×</td>
                    <td>
                      <button className="btn--icon btn--danger-icon" title="Delete" onClick={() => deleteXpMultiplier(x.role_id)}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Create Discord Role"
        icon={Users}
        description="Bot needs 'Manage Roles' permission and its highest role must be above the new role."
      >
        {roleError && <Alert type="error">{roleError}</Alert>}
        {roleSuccess && <Alert type="success">{roleSuccess}</Alert>}
        <div className="row-actions mb-4">
          <input
            placeholder="Role name"
            value={roleForm.name}
            onChange={(e) => setRoleForm((p) => ({ ...p, name: e.target.value }))}
          />
          <label className="text-muted text-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={roleForm.mentionable} onChange={(e) => setRoleForm((p) => ({ ...p, mentionable: e.target.checked }))} />
            mentionable
          </label>
          <label className="text-muted text-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={roleForm.hoist} onChange={(e) => setRoleForm((p) => ({ ...p, hoist: e.target.checked }))} />
            hoist
          </label>
          <button onClick={() => createRole(roleForm)}>
            <Plus size={13} /> Create
          </button>
        </div>
      </SectionCard>
    </>
  );
}