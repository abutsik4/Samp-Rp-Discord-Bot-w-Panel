import { SectionCard } from "../../components/SectionCard";
import { Alert } from "../../components/Alert";
import { EmptyState } from "../../components/EmptyState";
import { HelpCircle } from "lucide-react";

export function TriviaTab({ trivia, triviaError, triviaUserId, setTriviaUserId, resetTriviaUser }) {
  return (
    <SectionCard title="Trivia Leaderboard" icon={HelpCircle}>
      {triviaError && <Alert type="error">{triviaError}</Alert>}
      <div className="row-actions mb-4">
        <input
          placeholder="User ID"
          value={triviaUserId}
          onChange={(e) => setTriviaUserId(e.target.value)}
        />
        <button className="btn--danger" onClick={() => resetTriviaUser(triviaUserId)}>
          Reset user
        </button>
      </div>
      {trivia.length === 0 ? (
        <EmptyState icon={HelpCircle} title="No trivia data" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>User</th><th>Points</th><th>Correct/Total</th></tr></thead>
            <tbody>
              {trivia.map((r) => (
                <tr key={r.user_id}>
                  <td>{r.user_id}</td>
                  <td>{r.total_points}</td>
                  <td>{r.correct}/{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}