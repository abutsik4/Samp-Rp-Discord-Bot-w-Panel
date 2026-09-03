import { SectionCard } from "../../components/SectionCard";
import { Alert } from "../../components/Alert";
import { EmptyState } from "../../components/EmptyState";
import { Award, Plus, Save, Pencil, Trash2 } from "lucide-react";

export function BadgesTab({
  badgeUsers, badgeDefs, badgesError, badgesSuccess,
  selectedBadgeUserId, setSelectedBadgeUserId, selectedBadge, setSelectedBadge,
  badgeEdit, setBadgeEdit,
  grantBadge, seedBadgeDefinitions, upsertBadgeDefinition, deleteBadgeDefinition,
}) {
  return (
    <>
      {badgesError && <Alert type="error">{badgesError}</Alert>}
      {badgesSuccess && <Alert type="success">{badgesSuccess}</Alert>}
      <div className="grid grid-2">
        <SectionCard title="Grant Badge" icon={Award}>
          <div className="row-actions mb-4">
            <input
              placeholder="User ID"
              value={selectedBadgeUserId}
              onChange={(e) => setSelectedBadgeUserId(e.target.value)}
            />
            <select value={selectedBadge} onChange={(e) => setSelectedBadge(e.target.value)}>
              <option value="">Select badge</option>
              {badgeDefs.map((b) => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
            </select>
            <button onClick={() => grantBadge(selectedBadgeUserId, selectedBadge)}>
              <Award size={13} /> Grant
            </button>
          </div>
          {badgeUsers.length === 0 ? (
            <EmptyState icon={Award} title="No badge data" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>User</th><th>Badge count</th><th>Last earned</th></tr></thead>
                <tbody>
                  {badgeUsers.map((r) => (
                    <tr key={r.user_id}>
                      <td>{r.user_id}</td>
                      <td>{r.badge_count}</td>
                      <td>{r.last_earned_at || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Badge Definitions"
          icon={Award}
          description="Control what achievements exist and when they are awarded."
          actions={
            <button className="btn--ghost btn--sm" onClick={seedBadgeDefinitions}>
              <Plus size={13} /> Seed defaults
            </button>
          }
        >
          <div className="grid grid-2 mb-3">
            <input placeholder="ID (e.g. msg_100)" value={badgeEdit.id} onChange={(e) => setBadgeEdit((p) => ({ ...p, id: e.target.value }))} />
            <select value={badgeEdit.type} onChange={(e) => setBadgeEdit((p) => ({ ...p, type: e.target.value }))}>
              <option value="messages">messages</option>
              <option value="streak">streak</option>
              <option value="reactions_given">reactions_given</option>
              <option value="reactions_received">reactions_received</option>
            </select>
            <input placeholder="Threshold" type="number" value={badgeEdit.threshold} onChange={(e) => setBadgeEdit((p) => ({ ...p, threshold: Number(e.target.value) }))} />
            <input placeholder="Emoji" value={badgeEdit.emoji} onChange={(e) => setBadgeEdit((p) => ({ ...p, emoji: e.target.value }))} />
            <input placeholder="Name" value={badgeEdit.name} onChange={(e) => setBadgeEdit((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder="Description" value={badgeEdit.description} onChange={(e) => setBadgeEdit((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="row-actions mb-4">
            <label className="text-muted text-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={badgeEdit.enabled} onChange={(e) => setBadgeEdit((p) => ({ ...p, enabled: e.target.checked }))} />
              enabled
            </label>
            <button onClick={() => upsertBadgeDefinition(badgeEdit)}>
              <Save size={13} /> Save
            </button>
          </div>
          {badgeDefs.length === 0 ? (
            <EmptyState icon={Award} title="No definitions" message='Click "Seed defaults" to add them.' />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>ID</th><th>Type</th><th>Threshold</th><th>Name</th><th>Enabled</th><th></th></tr></thead>
                <tbody>
                  {badgeDefs.map((b) => (
                    <tr key={b.id}>
                      <td className="font-mono text-sm">{b.id}</td>
                      <td>{b.type}</td>
                      <td>{b.threshold}</td>
                      <td>{b.emoji} {b.name}</td>
                      <td>{b.enabled ? "yes" : "no"}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn--icon" onClick={() => setBadgeEdit({ ...b })} title="Edit"><Pencil size={13} /></button>
                          <button className="btn--icon btn--danger-icon" title="Delete" onClick={() => deleteBadgeDefinition(b.id)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}