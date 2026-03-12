import { useEffect, useState } from "react";
import { panelApi, formatApiError } from "../lib/api";

function SectionError({ error }) {
  if (!error) return null;
  return <div className="error-box" style={{ marginBottom: "8px" }}>{error}</div>;
}

function SectionSuccess({ msg }) {
  if (!msg) return null;
  return <div className="success-box" style={{ marginBottom: "8px" }}>{msg}</div>;
}

export function GameplayPage({ bot }) {
  // Levels
  const [levels, setLevels] = useState([]);
  const [levelsError, setLevelsError] = useState("");
  const [levelsUserId, setLevelsUserId] = useState("");
  const [levelSetXp, setLevelSetXp] = useState(0);

  // Badges (user view)
  const [badgeUsers, setBadgeUsers] = useState([]);
  const [badgeDefs, setBadgeDefs] = useState([]);
  const [badgesError, setBadgesError] = useState("");
  const [badgesSuccess, setBadgesSuccess] = useState("");
  const [selectedBadgeUserId, setSelectedBadgeUserId] = useState("");
  const [selectedBadge, setSelectedBadge] = useState("");
  const [badgeEdit, setBadgeEdit] = useState({ id: "", type: "messages", threshold: 0, name: "", emoji: "🏅", description: "", enabled: true, sort_order: 0 });

  // Perk rules
  const [perkRules, setPerkRules] = useState([]);
  const [perksError, setPerksError] = useState("");
  const [perksSuccess, setPerksSuccess] = useState("");
  const [perkForm, setPerkForm] = useState({ trigger_type: "badge", trigger_value: "", action_type: "grant_role", action_value: "", enabled: true });

  // XP multipliers
  const [xpMultipliers, setXpMultipliers] = useState([]);
  const [xpError, setXpError] = useState("");
  const [xpSuccess, setXpSuccess] = useState("");
  const [xpForm, setXpForm] = useState({ roleId: "", multiplier: 1.0 });

  // Roles (shared for perks + xp)
  const [roles, setRoles] = useState([]);
  const [rolesError, setRolesError] = useState("");

  // Role creation
  const [roleForm, setRoleForm] = useState({ name: "", mentionable: false, hoist: false });
  const [roleSuccess, setRoleSuccess] = useState("");
  const [roleError, setRoleError] = useState("");

  // Trivia
  const [trivia, setTrivia] = useState([]);
  const [triviaError, setTriviaError] = useState("");
  const [triviaUserId, setTriviaUserId] = useState("");

  // Wanted stars
  const [wanted, setWanted] = useState([]);
  const [wantedError, setWantedError] = useState("");
  const [wantedUserId, setWantedUserId] = useState("");
  const [wantedStars, setWantedStars] = useState(0);

  // Radio
  const [radio, setRadio] = useState({ totalVotes: 0, items: [] });
  const [radioError, setRadioError] = useState("");
  const [radioUserId, setRadioUserId] = useState("");

  // SAMP Life
  const [sampUsers, setSampUsers] = useState([]);
  const [sampLedger, setSampLedger] = useState([]);
  const [sampError, setSampError] = useState("");
  const [sampSuccess, setSampSuccess] = useState("");
  const [sampUserId, setSampUserId] = useState("");
  const [sampAdjust, setSampAdjust] = useState({ moneyDelta: 0, repDelta: 0, jailMinutes: 0 });

  function flash(setFn, msg) {
    setFn(msg);
    setTimeout(() => setFn(""), 4000);
  }

  async function loadLevels() {
    setLevelsError("");
    try {
      const r = await panelApi.gameplayLevels(bot.key, { limit: 100 });
      setLevels(r.items || []);
    } catch (e) {
      setLevelsError(formatApiError(e, "Failed to load levels"));
    }
  }

  async function loadBadges() {
    setBadgesError("");
    try {
      const [bu, bd] = await Promise.all([
        panelApi.badgeUsers(bot.key, { limit: 100 }),
        panelApi.badgeDefinitions(bot.key),
      ]);
      setBadgeUsers(bu.items || []);
      setBadgeDefs(bd.items || []);
    } catch (e) {
      setBadgesError(formatApiError(e, "Failed to load badges"));
    }
  }

  async function loadPerks() {
    setPerksError("");
    try {
      const r = await panelApi.perkRules(bot.key);
      setPerkRules(r.items || []);
    } catch (e) {
      setPerksError(formatApiError(e, "Failed to load perk rules"));
    }
  }

  async function loadXpMultipliers() {
    setXpError("");
    try {
      const r = await panelApi.xpMultipliers(bot.key);
      setXpMultipliers(r.items || []);
    } catch (e) {
      setXpError(formatApiError(e, "Failed to load XP multipliers"));
    }
  }

  async function loadRoles() {
    setRolesError("");
    try {
      const r = await panelApi.roles(bot.key, bot.guild_id);
      setRoles(r.roles || []);
    } catch (e) {
      setRolesError(formatApiError(e, "Failed to load Discord roles"));
    }
  }

  async function loadTrivia() {
    setTriviaError("");
    try {
      const r = await panelApi.triviaLeaderboard(bot.key, { limit: 100 });
      setTrivia(r.items || []);
    } catch (e) {
      setTriviaError(formatApiError(e, "Failed to load trivia data"));
    }
  }

  async function loadWanted() {
    setWantedError("");
    try {
      const r = await panelApi.wantedList(bot.key, { limit: 100 });
      setWanted(r.items || []);
    } catch (e) {
      setWantedError(formatApiError(e, "Failed to load wanted list"));
    }
  }

  async function loadRadio() {
    setRadioError("");
    try {
      const r = await panelApi.radioResults(bot.key);
      setRadio(r || { totalVotes: 0, items: [] });
    } catch (e) {
      setRadioError(formatApiError(e, "Failed to load radio votes"));
    }
  }

  async function loadSamp() {
    setSampError("");
    try {
      const [su, sl] = await Promise.all([
        panelApi.sampLifeUsers(bot.key, { limit: 100 }),
        panelApi.sampLifeLedger(bot.key, { limit: 100 }),
      ]);
      setSampUsers(su.items || []);
      setSampLedger(sl.items || []);
    } catch (e) {
      setSampError(formatApiError(e, "Failed to load SA-MP Life data"));
    }
  }

  useEffect(() => {
    loadLevels();
    loadBadges();
    loadPerks();
    loadXpMultipliers();
    loadRoles();
    loadTrivia();
    loadWanted();
    loadRadio();
    loadSamp();
  }, [bot.key]);

  return (
    <div className="page">
      <h1>Gameplay Systems</h1>

      <div className="grid grid-2">
        {/* Levels */}
        <div className="card form-card">
          <h3>Levels &amp; XP</h3>
          <SectionError error={levelsError} />
          <div className="inline-form">
            <input placeholder="User ID" value={levelsUserId} onChange={(e) => setLevelsUserId(e.target.value)} />
            <input placeholder="XP" type="number" value={levelSetXp} onChange={(e) => setLevelSetXp(Number(e.target.value))} />
            <button onClick={async () => {
              try {
                await panelApi.setGameplayLevel(bot.key, { userId: levelsUserId, xp: levelSetXp });
                await loadLevels();
              } catch (e) {
                setLevelsError(formatApiError(e, "Failed to set XP"));
              }
            }}>Set XP</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>User</th><th>Level</th><th>XP</th></tr></thead>
              <tbody>
                {levels.length === 0 ? <tr><td colSpan={3} style={{ color: "var(--muted)" }}>No data</td></tr> : null}
                {levels.map((r) => <tr key={r.user_id}><td>{r.user_id}</td><td>{r.level}</td><td>{r.xp}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>

        {/* Badges: user view */}
        <div className="card form-card">
          <h3>Badges: User View</h3>
          <SectionError error={badgesError} />
          <SectionSuccess msg={badgesSuccess} />
          <div className="inline-form">
            <input placeholder="User ID" value={selectedBadgeUserId} onChange={(e) => setSelectedBadgeUserId(e.target.value)} />
            <select value={selectedBadge} onChange={(e) => setSelectedBadge(e.target.value)}>
              <option value="">Select badge</option>
              {badgeDefs.map((b) => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
            </select>
            <button onClick={async () => {
              try {
                await panelApi.grantBadge(bot.key, selectedBadgeUserId, { badgeId: selectedBadge });
                flash(setBadgesSuccess, "Badge granted.");
                await loadBadges();
              } catch (e) {
                setBadgesError(formatApiError(e, "Failed to grant badge"));
              }
            }}>Grant</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>User</th><th>Badge count</th><th>Last earned</th></tr></thead>
              <tbody>
                {badgeUsers.length === 0 ? <tr><td colSpan={3} style={{ color: "var(--muted)" }}>No data</td></tr> : null}
                {badgeUsers.map((r) => <tr key={r.user_id}><td>{r.user_id}</td><td>{r.badge_count}</td><td>{r.last_earned_at || "-"}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        {/* Badge definitions */}
        <div className="card form-card">
          <h3>Badge Definitions</h3>
          <p className="muted">These control what achievements exist and when they are awarded.</p>
          <SectionError error={badgesError} />
          <SectionSuccess msg={badgesSuccess} />
          <div className="inline-form">
            <button className="btn-secondary" onClick={async () => {
              try {
                const r = await panelApi.seedBadgeDefinitions(bot.key);
                const count = r?.count ?? r?.seeded ?? "default";
                flash(setBadgesSuccess, `Seeded ${count} badge definitions.`);
                await loadBadges();
              } catch (e) {
                setBadgesError(formatApiError(e, "Failed to seed badges"));
              }
            }}>Seed defaults</button>
          </div>
          <div className="inline-form">
            <input placeholder="ID (e.g. msg_100)" value={badgeEdit.id} onChange={(e) => setBadgeEdit((p) => ({ ...p, id: e.target.value }))} />
            <select value={badgeEdit.type} onChange={(e) => setBadgeEdit((p) => ({ ...p, type: e.target.value }))}>
              <option value="messages">messages</option>
              <option value="streak">streak</option>
              <option value="reactions_given">reactions_given</option>
              <option value="reactions_received">reactions_received</option>
            </select>
            <input placeholder="Threshold" type="number" value={badgeEdit.threshold} onChange={(e) => setBadgeEdit((p) => ({ ...p, threshold: Number(e.target.value) }))} />
            <input placeholder="Emoji" value={badgeEdit.emoji} onChange={(e) => setBadgeEdit((p) => ({ ...p, emoji: e.target.value }))} />
          </div>
          <div className="inline-form">
            <input placeholder="Name" value={badgeEdit.name} onChange={(e) => setBadgeEdit((p) => ({ ...p, name: e.target.value }))} />
            <input placeholder="Description" value={badgeEdit.description} onChange={(e) => setBadgeEdit((p) => ({ ...p, description: e.target.value }))} />
            <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={badgeEdit.enabled} onChange={(e) => setBadgeEdit((p) => ({ ...p, enabled: e.target.checked }))} />
              enabled
            </label>
            <button onClick={async () => {
              try {
                await panelApi.upsertBadgeDefinition(bot.key, badgeEdit);
                setBadgeEdit({ id: "", type: "messages", threshold: 0, name: "", emoji: "🏅", description: "", enabled: true, sort_order: 0 });
                flash(setBadgesSuccess, "Badge definition saved.");
                await loadBadges();
              } catch (e) {
                setBadgesError(formatApiError(e, "Failed to save badge definition"));
              }
            }}>Save</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>ID</th><th>Type</th><th>Threshold</th><th>Name</th><th>Enabled</th><th></th></tr></thead>
              <tbody>
                {badgeDefs.length === 0 ? <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No definitions — click "Seed defaults" to add them</td></tr> : null}
                {badgeDefs.map((b) => (
                  <tr key={b.id}>
                    <td>{b.id}</td>
                    <td>{b.type}</td>
                    <td>{b.threshold}</td>
                    <td>{b.emoji} {b.name}</td>
                    <td>{b.enabled ? "yes" : "no"}</td>
                    <td>
                      <div className="inline-form">
                        <button className="btn-secondary" onClick={() => setBadgeEdit({ ...b })}>Edit</button>
                        <button className="btn-danger" onClick={async () => {
                          try {
                            await panelApi.deleteBadgeDefinition(bot.key, b.id);
                            await loadBadges();
                          } catch (e) {
                            setBadgesError(formatApiError(e, "Failed to delete badge definition"));
                          }
                        }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Perk rules */}
        <div className="card form-card">
          <h3>Perk Rules (Achievement → Discord Role)</h3>
          <p className="muted">When a user earns a badge or reaches a level, the bot grants a Discord role.</p>
          <SectionError error={perksError} />
          <SectionSuccess msg={perksSuccess} />
          {rolesError ? <div className="error-box" style={{ marginBottom: "8px" }}>Roles: {rolesError}</div> : null}
          <div className="inline-form">
            <select value={perkForm.trigger_type} onChange={(e) => setPerkForm((p) => ({ ...p, trigger_type: e.target.value, trigger_value: "" }))}>
              <option value="badge">badge</option>
              <option value="level">level</option>
            </select>
            {perkForm.trigger_type === "badge" ? (
              <select value={perkForm.trigger_value} onChange={(e) => setPerkForm((p) => ({ ...p, trigger_value: e.target.value }))}>
                <option value="">Select badge</option>
                {badgeDefs.map((b) => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
              </select>
            ) : (
              <input placeholder="Level (number)" type="number" value={perkForm.trigger_value} onChange={(e) => setPerkForm((p) => ({ ...p, trigger_value: String(Number(e.target.value)) }))} />
            )}
            <select value={perkForm.action_value} onChange={(e) => setPerkForm((p) => ({ ...p, action_value: e.target.value }))}>
              <option value="">Select role</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={perkForm.enabled} onChange={(e) => setPerkForm((p) => ({ ...p, enabled: e.target.checked }))} />
              enabled
            </label>
            <button onClick={async () => {
              try {
                await panelApi.upsertPerkRule(bot.key, perkForm);
                setPerkForm({ trigger_type: "badge", trigger_value: "", action_type: "grant_role", action_value: "", enabled: true });
                flash(setPerksSuccess, "Perk rule saved.");
                await loadPerks();
              } catch (e) {
                setPerksError(formatApiError(e, "Failed to save perk rule"));
              }
            }}>Add</button>
          </div>
          <div className="inline-form">
            <button className="btn-secondary" onClick={async () => {
              try {
                const r = await panelApi.reconcilePerks(bot.key, { limit: 200 });
                flash(setPerksSuccess, `Perks reconciled: ${r?.applied ?? 0} grants applied.`);
              } catch (e) {
                setPerksError(formatApiError(e, "Failed to reconcile perks"));
              }
            }}>Reapply perks (top 200)</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Trigger type</th><th>Trigger value</th><th>Role</th><th>Enabled</th><th></th></tr></thead>
              <tbody>
                {perkRules.length === 0 ? <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No perk rules configured</td></tr> : null}
                {perkRules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.trigger_type}</td>
                    <td>{r.trigger_type === "badge" ? (badgeDefs.find((b) => b.id === r.trigger_value)?.name || r.trigger_value) : `Level ${r.trigger_value}`}</td>
                    <td>{roles.find((x) => x.id === r.action_value)?.name || r.action_value}</td>
                    <td>{r.enabled ? "yes" : "no"}</td>
                    <td>
                      <button className="btn-danger" onClick={async () => {
                        try {
                          await panelApi.deletePerkRule(bot.key, r.id);
                          await loadPerks();
                        } catch (e) {
                          setPerksError(formatApiError(e, "Failed to delete rule"));
                        }
                      }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        {/* XP multipliers */}
        <div className="card form-card">
          <h3>XP Multipliers (by Role)</h3>
          <p className="muted">Highest multiplier among user's roles wins. 1.2 = +20% XP per message.</p>
          <SectionError error={xpError} />
          <SectionSuccess msg={xpSuccess} />
          {rolesError ? <div className="error-box" style={{ marginBottom: "8px" }}>Roles: {rolesError}</div> : null}
          <div className="inline-form">
            <select value={xpForm.roleId} onChange={(e) => setXpForm((p) => ({ ...p, roleId: e.target.value }))}>
              <option value="">Select role</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <input placeholder="Multiplier (e.g. 1.5)" type="number" step="0.05" min="0" max="10" value={xpForm.multiplier} onChange={(e) => setXpForm((p) => ({ ...p, multiplier: Number(e.target.value) }))} />
            <button onClick={async () => {
              try {
                await panelApi.upsertXpMultiplier(bot.key, xpForm);
                setXpForm({ roleId: "", multiplier: 1.0 });
                flash(setXpSuccess, "XP multiplier saved.");
                await loadXpMultipliers();
              } catch (e) {
                setXpError(formatApiError(e, "Failed to save XP multiplier"));
              }
            }}>Save</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Role</th><th>Multiplier</th><th></th></tr></thead>
              <tbody>
                {xpMultipliers.length === 0 ? <tr><td colSpan={3} style={{ color: "var(--muted)" }}>No multipliers set</td></tr> : null}
                {xpMultipliers.map((x) => (
                  <tr key={x.role_id}>
                    <td>{roles.find((r) => r.id === x.role_id)?.name || x.role_id}</td>
                    <td>{x.multiplier}×</td>
                    <td>
                      <button className="btn-danger" onClick={async () => {
                        try {
                          await panelApi.deleteXpMultiplier(bot.key, x.role_id);
                          await loadXpMultipliers();
                        } catch (e) {
                          setXpError(formatApiError(e, "Failed to delete multiplier"));
                        }
                      }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create Discord role */}
        <div className="card form-card">
          <h3>Create Discord Role</h3>
          <p className="muted">Bot needs "Manage Roles" permission and its highest role must be above the new role.</p>
          <SectionError error={roleError} />
          <SectionSuccess msg={roleSuccess} />
          <div className="inline-form">
            <input placeholder="Role name" value={roleForm.name} onChange={(e) => setRoleForm((p) => ({ ...p, name: e.target.value }))} />
            <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={roleForm.mentionable} onChange={(e) => setRoleForm((p) => ({ ...p, mentionable: e.target.checked }))} />
              mentionable
            </label>
            <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={roleForm.hoist} onChange={(e) => setRoleForm((p) => ({ ...p, hoist: e.target.checked }))} />
              hoist
            </label>
            <button onClick={async () => {
              try {
                await panelApi.createRole(bot.key, { guildId: bot.guild_id, ...roleForm });
                setRoleForm({ name: "", mentionable: false, hoist: false });
                flash(setRoleSuccess, `Role "${roleForm.name}" created.`);
                await loadRoles();
              } catch (e) {
                setRoleError(formatApiError(e, "Failed to create role"));
              }
            }}>Create</button>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        {/* Trivia */}
        <div className="card form-card">
          <h3>Trivia</h3>
          <SectionError error={triviaError} />
          <div className="inline-form">
            <input placeholder="User ID" value={triviaUserId} onChange={(e) => setTriviaUserId(e.target.value)} />
            <button className="btn-danger" onClick={async () => {
              try {
                await panelApi.resetTriviaUser(bot.key, { userId: triviaUserId });
                await loadTrivia();
              } catch (e) {
                setTriviaError(formatApiError(e, "Failed to reset trivia"));
              }
            }}>Reset user</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>User</th><th>Points</th><th>Correct/Total</th></tr></thead>
              <tbody>
                {trivia.length === 0 ? <tr><td colSpan={3} style={{ color: "var(--muted)" }}>No data</td></tr> : null}
                {trivia.map((r) => <tr key={r.user_id}><td>{r.user_id}</td><td>{r.total_points}</td><td>{r.correct}/{r.total}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>

        {/* Wanted stars */}
        <div className="card form-card">
          <h3>Wanted Stars</h3>
          <SectionError error={wantedError} />
          <div className="inline-form">
            <input placeholder="User ID" value={wantedUserId} onChange={(e) => setWantedUserId(e.target.value)} />
            <input placeholder="Stars (0–6)" type="number" min="0" max="6" value={wantedStars} onChange={(e) => setWantedStars(Number(e.target.value))} />
            <button onClick={async () => {
              try {
                await panelApi.setWanted(bot.key, { userId: wantedUserId, stars: wantedStars });
                await loadWanted();
              } catch (e) {
                setWantedError(formatApiError(e, "Failed to set stars"));
              }
            }}>Set</button>
            <button className="btn-danger" onClick={async () => {
              try {
                await panelApi.clearWanted(bot.key, { userId: wantedUserId });
                await loadWanted();
              } catch (e) {
                setWantedError(formatApiError(e, "Failed to clear stars"));
              }
            }}>Clear</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>User</th><th>Stars</th><th>Total infractions</th></tr></thead>
              <tbody>
                {wanted.length === 0 ? <tr><td colSpan={3} style={{ color: "var(--muted)" }}>No data</td></tr> : null}
                {wanted.map((r) => <tr key={r.user_id}><td>{r.user_id}</td><td>{"⭐".repeat(r.stars)}</td><td>{r.total_infractions}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        {/* Radio */}
        <div className="card form-card">
          <h3>Radio Votes</h3>
          <SectionError error={radioError} />
          <p className="muted">Total votes: {radio.totalVotes || 0}</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Station</th><th>Votes</th><th>%</th></tr></thead>
              <tbody>
                {(radio.items || []).length === 0 ? <tr><td colSpan={3} style={{ color: "var(--muted)" }}>No votes</td></tr> : null}
                {(radio.items || []).map((r) => <tr key={r.id}><td>{r.emoji} {r.name}</td><td>{r.votes}</td><td>{r.pct}%</td></tr>)}
              </tbody>
            </table>
          </div>
          <div className="inline-form">
            <input placeholder="User ID (optional, clears one user)" value={radioUserId} onChange={(e) => setRadioUserId(e.target.value)} />
            <button className="btn-danger" onClick={async () => {
              try {
                await panelApi.resetRadio(bot.key, { userId: radioUserId || undefined });
                await loadRadio();
              } catch (e) {
                setRadioError(formatApiError(e, "Failed to reset votes"));
              }
            }}>Reset votes</button>
          </div>
        </div>

        {/* SAMP Life */}
        <div className="card form-card">
          <h3>SA-MP Life Users</h3>
          <SectionError error={sampError} />
          <SectionSuccess msg={sampSuccess} />
          <div className="inline-form">
            <input placeholder="User ID" value={sampUserId} onChange={(e) => setSampUserId(e.target.value)} />
            <input placeholder="Money Δ" type="number" value={sampAdjust.moneyDelta} onChange={(e) => setSampAdjust((p) => ({ ...p, moneyDelta: Number(e.target.value) }))} />
            <input placeholder="Rep Δ" type="number" value={sampAdjust.repDelta} onChange={(e) => setSampAdjust((p) => ({ ...p, repDelta: Number(e.target.value) }))} />
            <input placeholder="Jail min" type="number" value={sampAdjust.jailMinutes} onChange={(e) => setSampAdjust((p) => ({ ...p, jailMinutes: Number(e.target.value) }))} />
            <button onClick={async () => {
              try {
                await panelApi.adjustSampLifeUser(bot.key, sampUserId, sampAdjust);
                flash(setSampSuccess, "Adjustment applied.");
                await loadSamp();
              } catch (e) {
                setSampError(formatApiError(e, "Failed to apply adjustment"));
              }
            }}>Apply</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>User</th><th>Money</th><th>Rep</th><th>Jail until</th></tr></thead>
              <tbody>
                {sampUsers.length === 0 ? <tr><td colSpan={4} style={{ color: "var(--muted)" }}>No data</td></tr> : null}
                {sampUsers.map((r) => <tr key={r.user_id}><td>{r.user_id}</td><td>{r.money}</td><td>{r.rep}</td><td>{r.jail_until || "—"}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card form-card">
        <h3>SA-MP Ledger</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>ID</th><th>Type</th><th>From</th><th>To</th><th>Amount</th><th>Time</th></tr></thead>
            <tbody>
              {sampLedger.length === 0 ? <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No ledger entries</td></tr> : null}
              {sampLedger.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.type}</td>
                  <td>{row.from_user || "—"}</td>
                  <td>{row.to_user || "—"}</td>
                  <td>{row.amount}</td>
                  <td>{row.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
