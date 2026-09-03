import { SectionCard } from "../../components/SectionCard";
import { Alert } from "../../components/Alert";
import { EmptyState } from "../../components/EmptyState";
import { Zap, Plus, RefreshCw, Trash2 } from "lucide-react";

export function PerksTab({
  perkRules, perksError, perksSuccess, perkForm, setPerkForm,
  badgeDefs, roles, rolesError,
  reconcilePerks, upsertPerkRule, deletePerkRule,
}) {
  return (
    <SectionCard
      title="Perk Rules"
      icon={Zap}
      description="When a user earns a badge or reaches a level, the bot grants a Discord role."
      actions={
        <button className="btn--ghost btn--sm" onClick={reconcilePerks}>
          <RefreshCw size={13} /> Reapply (top 200)
        </button>
      }
    >
      {perksError && <Alert type="error">{perksError}</Alert>}
      {perksSuccess && <Alert type="success">{perksSuccess}</Alert>}
      {rolesError && <Alert type="warning">Roles: {rolesError}</Alert>}
      <div className="row-actions mb-4">
        <select
          value={perkForm.trigger_type}
          onChange={(e) => setPerkForm((p) => ({ ...p, trigger_type: e.target.value, trigger_value: "" }))}
        >
          <option value="badge">badge</option>
          <option value="level">level</option>
        </select>
        {perkForm.trigger_type === "badge" ? (
          <select
            value={perkForm.trigger_value}
            onChange={(e) => setPerkForm((p) => ({ ...p, trigger_value: e.target.value }))}
          >
            <option value="">Select badge</option>
            {badgeDefs.map((b) => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
          </select>
        ) : (
          <input
            placeholder="Level (number)"
            type="number"
            value={perkForm.trigger_value}
            onChange={(e) => setPerkForm((p) => ({ ...p, trigger_value: String(Number(e.target.value)) }))}
          />
        )}
        <select
          value={perkForm.action_value}
          onChange={(e) => setPerkForm((p) => ({ ...p, action_value: e.target.value }))}
        >
          <option value="">Select role</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label className="text-muted text-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={perkForm.enabled}
            onChange={(e) => setPerkForm((p) => ({ ...p, enabled: e.target.checked }))}
          />
          enabled
        </label>
        <button onClick={() => upsertPerkRule(perkForm)}>
          <Plus size={13} /> Add
        </button>
      </div>
      {perkRules.length === 0 ? (
        <EmptyState icon={Zap} title="No perk rules configured" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Trigger type</th><th>Trigger value</th><th>Role</th><th>Enabled</th><th></th></tr></thead>
            <tbody>
              {perkRules.map((r) => (
                <tr key={r.id}>
                  <td>{r.trigger_type}</td>
                  <td>{r.trigger_type === "badge" ? (badgeDefs.find((b) => b.id === r.trigger_value)?.name || r.trigger_value) : `Level ${r.trigger_value}`}</td>
                  <td>{roles.find((x) => x.id === r.action_value)?.name || r.action_value}</td>
                  <td>{r.enabled ? "yes" : "no"}</td>
                  <td>
                    <button className="btn--icon btn--danger-icon" title="Delete" onClick={() => deletePerkRule(r.id)}>
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
  );
}