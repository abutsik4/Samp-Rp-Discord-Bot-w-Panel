import { SectionCard } from "../../components/SectionCard";
import { Alert } from "../../components/Alert";
import { EmptyState } from "../../components/EmptyState";
import { Target, Save } from "lucide-react";

export function WantedTab({ wanted, wantedError, wantedUserId, setWantedUserId, wantedStars, setWantedStars, setWantedStarsAction, clearWanted }) {
  return (
    <SectionCard title="Wanted Stars" icon={Target}>
      {wantedError && <Alert type="error">{wantedError}</Alert>}
      <div className="row-actions mb-4">
        <input
          placeholder="User ID"
          value={wantedUserId}
          onChange={(e) => setWantedUserId(e.target.value)}
        />
        <input
          placeholder="Stars (0–6)"
          type="number" min="0" max="6"
          value={wantedStars}
          onChange={(e) => setWantedStars(Number(e.target.value))}
        />
        <button onClick={() => setWantedStarsAction(wantedUserId, wantedStars)}>
          <Save size={13} /> Set
        </button>
        <button className="btn--danger" onClick={() => clearWanted(wantedUserId)}>
          Clear
        </button>
      </div>
      {wanted.length === 0 ? (
        <EmptyState icon={Target} title="No wanted data" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>User</th><th>Stars</th><th>Total infractions</th></tr></thead>
            <tbody>
              {wanted.map((r) => (
                <tr key={r.user_id}>
                  <td>{r.user_id}</td>
                  <td>{"⭐".repeat(r.stars)}</td>
                  <td>{r.total_infractions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}