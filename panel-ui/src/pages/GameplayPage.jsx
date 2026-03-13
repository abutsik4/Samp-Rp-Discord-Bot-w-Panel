import { useEffect, useState } from "react";
import {
  Gamepad2, TrendingUp, Award, Zap, Star, Users,
  HelpCircle, Target, Radio, Map, Trash2, Save,
  Pencil, RefreshCw, Plus,
} from "lucide-react";
import { panelApi, formatApiError } from "../lib/api";
import { Alert } from "../components/Alert";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";

const TABS = [
  { key: "levels",   icon: TrendingUp, label: "Levels" },
  { key: "badges",   icon: Award,      label: "Badges" },
  { key: "perks",    icon: Zap,        label: "Perks" },
  { key: "boosts",   icon: Star,       label: "XP Boosts" },
  { key: "roles",    icon: Users,      label: "Roles" },
  { key: "trivia",   icon: HelpCircle, label: "Trivia" },
  { key: "wanted",   icon: Target,     label: "Wanted" },
  { key: "radio",    icon: Radio,      label: "Radio" },
  { key: "samplife", icon: Map,        label: "SA-MP Life" },
];

export function GameplayPage({ bot }) {
  const [tab, setTab] = useState("levels");

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
      <PageHeader icon={Gamepad2} title="Gameplay Systems" subtitle="Manage levels, badges, perks, and in-game features." />

      <div className="page-tabs">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            className={`page-tab${tab === key ? " active" : ""}`}
            onClick={() => setTab(key)}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* LEVELS */}
      {tab === "levels" && (
        <SectionCard title="Levels &amp; XP" icon={TrendingUp} description="View and manually adjust user XP.">
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
            <button
              onClick={async () => {
                try {
                  await panelApi.setGameplayLevel(bot.key, { userId: levelsUserId, xp: levelSetXp });
                  await loadLevels();
                } catch (e) {
                  setLevelsError(formatApiError(e, "Failed to set XP"));
                }
              }}
            >
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
      )}

      {/* BADGES */}
      {tab === "badges" && (
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
                <button
                  onClick={async () => {
                    try {
                      await panelApi.grantBadge(bot.key, selectedBadgeUserId, { badgeId: selectedBadge });
                      flash(setBadgesSuccess, "Badge granted.");
                      await loadBadges();
                    } catch (e) {
                      setBadgesError(formatApiError(e, "Failed to grant badge"));
                    }
                  }}
                >
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
                <button
                  className="btn--ghost btn--sm"
                  onClick={async () => {
                    try {
                      const r = await panelApi.seedBadgeDefinitions(bot.key);
                      const count = r?.count ?? r?.seeded ?? "default";
                      flash(setBadgesSuccess, `Seeded ${count} badge definitions.`);
                      await loadBadges();
                    } catch (e) {
                      setBadgesError(formatApiError(e, "Failed to seed badges"));
                    }
                  }}
                >
                  <Plus size={13} /> Seed defaults
                </button>
              }
            >
              <div className="grid grid-2 mb-3">
                <input
                  placeholder="ID (e.g. msg_100)"
                  value={badgeEdit.id}
                  onChange={(e) => setBadgeEdit((p) => ({ ...p, id: e.target.value }))}
                />
                <select value={badgeEdit.type} onChange={(e) => setBadgeEdit((p) => ({ ...p, type: e.target.value }))}>
                  <option value="messages">messages</option>
                  <option value="streak">streak</option>
                  <option value="reactions_given">reactions_given</option>
                  <option value="reactions_received">reactions_received</option>
                </select>
                <input
                  placeholder="Threshold"
                  type="number"
                  value={badgeEdit.threshold}
                  onChange={(e) => setBadgeEdit((p) => ({ ...p, threshold: Number(e.target.value) }))}
                />
                <input
                  placeholder="Emoji"
                  value={badgeEdit.emoji}
                  onChange={(e) => setBadgeEdit((p) => ({ ...p, emoji: e.target.value }))}
                />
                <input
                  placeholder="Name"
                  value={badgeEdit.name}
                  onChange={(e) => setBadgeEdit((p) => ({ ...p, name: e.target.value }))}
                />
                <input
                  placeholder="Description"
                  value={badgeEdit.description}
                  onChange={(e) => setBadgeEdit((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="row-actions mb-4">
                <label className="text-muted text-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={badgeEdit.enabled}
                    onChange={(e) => setBadgeEdit((p) => ({ ...p, enabled: e.target.checked }))}
                  />
                  enabled
                </label>
                <button
                  onClick={async () => {
                    try {
                      await panelApi.upsertBadgeDefinition(bot.key, badgeEdit);
                      setBadgeEdit({ id: "", type: "messages", threshold: 0, name: "", emoji: "🏅", description: "", enabled: true, sort_order: 0 });
                      flash(setBadgesSuccess, "Badge definition saved.");
                      await loadBadges();
                    } catch (e) {
                      setBadgesError(formatApiError(e, "Failed to save badge definition"));
                    }
                  }}
                >
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
                              <button className="btn--icon" onClick={() => setBadgeEdit({ ...b })} title="Edit">
                                <Pencil size={13} />
                              </button>
                              <button
                                className="btn--icon btn--danger-icon"
                                title="Delete"
                                onClick={async () => {
                                  try {
                                    await panelApi.deleteBadgeDefinition(bot.key, b.id);
                                    await loadBadges();
                                  } catch (e) {
                                    setBadgesError(formatApiError(e, "Failed to delete badge definition"));
                                  }
                                }}
                              >
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
      )}

      {/* PERKS */}
      {tab === "perks" && (
        <SectionCard
          title="Perk Rules"
          icon={Zap}
          description="When a user earns a badge or reaches a level, the bot grants a Discord role."
          actions={
            <button
              className="btn--ghost btn--sm"
              onClick={async () => {
                try {
                  const r = await panelApi.reconcilePerks(bot.key, { limit: 200 });
                  flash(setPerksSuccess, `Perks reconciled: ${r?.applied ?? 0} grants applied.`);
                } catch (e) {
                  setPerksError(formatApiError(e, "Failed to reconcile perks"));
                }
              }}
            >
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
            <button
              onClick={async () => {
                try {
                  await panelApi.upsertPerkRule(bot.key, perkForm);
                  setPerkForm({ trigger_type: "badge", trigger_value: "", action_type: "grant_role", action_value: "", enabled: true });
                  flash(setPerksSuccess, "Perk rule saved.");
                  await loadPerks();
                } catch (e) {
                  setPerksError(formatApiError(e, "Failed to save perk rule"));
                }
              }}
            >
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
                        <button
                          className="btn--icon btn--danger-icon"
                          title="Delete"
                          onClick={async () => {
                            try {
                              await panelApi.deletePerkRule(bot.key, r.id);
                              await loadPerks();
                            } catch (e) {
                              setPerksError(formatApiError(e, "Failed to delete rule"));
                            }
                          }}
                        >
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
      )}

      {/* XP BOOSTS */}
      {tab === "boosts" && (
        <SectionCard
          title="XP Multipliers"
          icon={Star}
          description="Highest multiplier among user's roles wins. 1.2 = +20% XP per message."
        >
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
              type="number"
              step="0.05"
              min="0"
              max="10"
              value={xpForm.multiplier}
              onChange={(e) => setXpForm((p) => ({ ...p, multiplier: Number(e.target.value) }))}
            />
            <button
              onClick={async () => {
                try {
                  await panelApi.upsertXpMultiplier(bot.key, xpForm);
                  setXpForm({ roleId: "", multiplier: 1.0 });
                  flash(setXpSuccess, "XP multiplier saved.");
                  await loadXpMultipliers();
                } catch (e) {
                  setXpError(formatApiError(e, "Failed to save XP multiplier"));
                }
              }}
            >
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
                        <button
                          className="btn--icon btn--danger-icon"
                          title="Delete"
                          onClick={async () => {
                            try {
                              await panelApi.deleteXpMultiplier(bot.key, x.role_id);
                              await loadXpMultipliers();
                            } catch (e) {
                              setXpError(formatApiError(e, "Failed to delete multiplier"));
                            }
                          }}
                        >
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
      )}

      {/* ROLES */}
      {tab === "roles" && (
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
              <input
                type="checkbox"
                checked={roleForm.mentionable}
                onChange={(e) => setRoleForm((p) => ({ ...p, mentionable: e.target.checked }))}
              />
              mentionable
            </label>
            <label className="text-muted text-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={roleForm.hoist}
                onChange={(e) => setRoleForm((p) => ({ ...p, hoist: e.target.checked }))}
              />
              hoist
            </label>
            <button
              onClick={async () => {
                try {
                  await panelApi.createRole(bot.key, { guildId: bot.guild_id, ...roleForm });
                  setRoleForm({ name: "", mentionable: false, hoist: false });
                  flash(setRoleSuccess, `Role "${roleForm.name}" created.`);
                  await loadRoles();
                } catch (e) {
                  setRoleError(formatApiError(e, "Failed to create role"));
                }
              }}
            >
              <Plus size={13} /> Create
            </button>
          </div>
        </SectionCard>
      )}

      {/* TRIVIA */}
      {tab === "trivia" && (
        <SectionCard title="Trivia Leaderboard" icon={HelpCircle}>
          {triviaError && <Alert type="error">{triviaError}</Alert>}
          <div className="row-actions mb-4">
            <input
              placeholder="User ID"
              value={triviaUserId}
              onChange={(e) => setTriviaUserId(e.target.value)}
            />
            <button
              className="btn--danger"
              onClick={async () => {
                try {
                  await panelApi.resetTriviaUser(bot.key, { userId: triviaUserId });
                  await loadTrivia();
                } catch (e) {
                  setTriviaError(formatApiError(e, "Failed to reset trivia"));
                }
              }}
            >
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
      )}

      {/* WANTED */}
      {tab === "wanted" && (
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
              type="number"
              min="0"
              max="6"
              value={wantedStars}
              onChange={(e) => setWantedStars(Number(e.target.value))}
            />
            <button
              onClick={async () => {
                try {
                  await panelApi.setWanted(bot.key, { userId: wantedUserId, stars: wantedStars });
                  await loadWanted();
                } catch (e) {
                  setWantedError(formatApiError(e, "Failed to set stars"));
                }
              }}
            >
              <Save size={13} /> Set
            </button>
            <button
              className="btn--danger"
              onClick={async () => {
                try {
                  await panelApi.clearWanted(bot.key, { userId: wantedUserId });
                  await loadWanted();
                } catch (e) {
                  setWantedError(formatApiError(e, "Failed to clear stars"));
                }
              }}
            >
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
      )}

      {/* RADIO */}
      {tab === "radio" && (
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
            <button
              className="btn--danger"
              onClick={async () => {
                try {
                  await panelApi.resetRadio(bot.key, { userId: radioUserId || undefined });
                  await loadRadio();
                } catch (e) {
                  setRadioError(formatApiError(e, "Failed to reset votes"));
                }
              }}
            >
              Reset votes
            </button>
          </div>
        </SectionCard>
      )}

      {/* SA-MP LIFE */}
      {tab === "samplife" && (
        <>
          <SectionCard title="SA-MP Life Users" icon={Map}>
            {sampError && <Alert type="error">{sampError}</Alert>}
            {sampSuccess && <Alert type="success">{sampSuccess}</Alert>}
            <div className="row-actions mb-4">
              <input
                placeholder="User ID"
                value={sampUserId}
                onChange={(e) => setSampUserId(e.target.value)}
              />
              <input
                placeholder="Money Δ"
                type="number"
                value={sampAdjust.moneyDelta}
                onChange={(e) => setSampAdjust((p) => ({ ...p, moneyDelta: Number(e.target.value) }))}
              />
              <input
                placeholder="Rep Δ"
                type="number"
                value={sampAdjust.repDelta}
                onChange={(e) => setSampAdjust((p) => ({ ...p, repDelta: Number(e.target.value) }))}
              />
              <input
                placeholder="Jail min"
                type="number"
                value={sampAdjust.jailMinutes}
                onChange={(e) => setSampAdjust((p) => ({ ...p, jailMinutes: Number(e.target.value) }))}
              />
              <button
                onClick={async () => {
                  try {
                    await panelApi.adjustSampLifeUser(bot.key, sampUserId, sampAdjust);
                    flash(setSampSuccess, "Adjustment applied.");
                    await loadSamp();
                  } catch (e) {
                    setSampError(formatApiError(e, "Failed to apply adjustment"));
                  }
                }}
              >
                Apply
              </button>
            </div>
            {sampUsers.length === 0 ? (
              <EmptyState icon={Map} title="No SA-MP Life data" />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>User</th><th>Money</th><th>Rep</th><th>Jail until</th></tr></thead>
                  <tbody>
                    {sampUsers.map((r) => (
                      <tr key={r.user_id}>
                        <td>{r.user_id}</td>
                        <td>{r.money}</td>
                        <td>{r.rep}</td>
                        <td>{r.jail_until || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="SA-MP Ledger" icon={Map} description="Transaction history.">
            {sampLedger.length === 0 ? (
              <EmptyState icon={Map} title="No ledger entries" />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>ID</th><th>Type</th><th>From</th><th>To</th><th>Amount</th><th>Time</th></tr></thead>
                  <tbody>
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
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
