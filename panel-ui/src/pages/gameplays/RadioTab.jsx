import { SectionCard } from "../../components/SectionCard";
import { Alert } from "../../components/Alert";
import { EmptyState } from "../../components/EmptyState";
import { Radio } from "lucide-react";

export function RadioTab({ radio, radioError, radioUserId, setRadioUserId, resetRadio }) {
  return (
    <SectionCard
      title="Radio Votes"
      icon={Radio}
      description={`Total votes: ${radio.totalVotes || 0}`}
    >
      {radioError && <Alert type="error">{radioError}</Alert>}
      {(radio.items || []).length === 0 ? (
        <EmptyState icon={Radio} title="No votes recorded" />
      ) : (
        <div className="table-wrap mb-4">
          <table className="data-table">
            <thead><tr><th>Station</th><th>Votes</th><th>%</th></tr></thead>
            <tbody>
              {(radio.items || []).map((r) => (
                <tr key={r.id}>
                  <td>{r.emoji} {r.name}</td>
                  <td>{r.votes}</td>
                  <td>{r.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row-actions">
        <input
          placeholder="User ID (optional, clears one user)"
          value={radioUserId}
          onChange={(e) => setRadioUserId(e.target.value)}
        />
        <button className="btn--danger" onClick={() => resetRadio(radioUserId)}>
          Reset votes
        </button>
      </div>
    </SectionCard>
  );
}