import { SectionCard } from "../../components/SectionCard";
import { Alert } from "../../components/Alert";
import { EmptyState } from "../../components/EmptyState";
import { TrendingUp, Save } from "lucide-react";

export function LevelsTab({ levels, levelsError, levelsUserId, setLevelsUserId, levelSetXp, setLevelSetXp, setLevelXp }) {
  return (
    <SectionCard title="Levels & XP" icon={TrendingUp} description="View and manually adjust user XP.">
      {levelsError && <Alert type="error">{levelsError}</Alert>}
      <div className="row-actions mb-4">
        <input
          placeholder="User ID"
          value={levelsUserId}
          onChange={(e) => setLevelsUserId(e.target.value)}
        />
        <input
          placeholder="XP"
          type="number"
          value={levelSetXp}
          onChange={(e) => setLevelSetXp(Number(e.target.value))}
        />
        <button onClick={() => setLevelXp(levelsUserId, levelSetXp)}>
          <Save size={13} /> Set XP
        </button>
      </div>
      {levels.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No level data" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>User</th><th>Level</th><th>XP</th></tr></thead>
            <tbody>
              {levels.map((r) => (
                <tr key={r.user_id}>
                  <td>{r.user_id}</td>
                  <td>{r.level}</td>
                  <td>{r.xp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}