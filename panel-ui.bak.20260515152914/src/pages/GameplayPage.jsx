import { useEffect, useState } from "react";
import {
  Gamepad2, TrendingUp, Award, Zap, Star, Users,
  HelpCircle, Target, Radio, Map, Trash2, Save, Building2, Shield,
  Pencil, RefreshCw, Plus, History,
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
  const [sampBusinessOverview, setSampBusinessOverview] = useState({ summary: {}, distribution: [], topOwners: [], atRisk: [] });
  const [sampTruckOverview, setSampTruckOverview] = useState({ summary: {}, routes: [], cargos: [], incidents: [], topDrivers: [] });
  const [sampGangOverview, setSampGangOverview] = useState([]);
  const [sampUserDetails, setSampUserDetails] = useState(null);
  const [sampHistory, setSampHistory] = useState([]);
  const [sampLiveOps, setSampLiveOps] = useState({
    active_event_name: "",
    active_event_message: "",
    business_income_multiplier: 1,
    business_run_multiplier: 1,
    gang_support_cost_multiplier: 1,
    rep_multiplier: 1,
  });
  const [sampLiveOpsPresets, setSampLiveOpsPresets] = useState([]);
  const [sampTerritories, setSampTerritories] = useState([]);
  const [sampPresetForm, setSampPresetForm] = useState({ name: "", preset_type: "weekend" });

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
      const [su, sl, sh, bo, to, go, lo, presets, territories] = await Promise.all([
        panelApi.sampLifeUsers(bot.key, { limit: 100 }),
        panelApi.sampLifeLedger(bot.key, { limit: 100 }),
        panelApi.sampLifeHistory(bot.key, { limit: 80 }),
        panelApi.sampLifeBusinessOverview(bot.key),
        panelApi.sampLifeTruckOverview(bot.key),
        panelApi.sampLifeGangOverview(bot.key),
        panelApi.sampLifeLiveOps(bot.key),
        panelApi.sampLifeLiveOpsPresets(bot.key),
        panelApi.sampLifeTerritories(bot.key),
      ]);
      setSampUsers(su.items || []);
      setSampLedger(sl.items || []);
      setSampHistory(sh.items || []);
      setSampBusinessOverview(bo || { summary: {}, distribution: [], topOwners: [], atRisk: [] });
      setSampTruckOverview(to || { summary: {}, routes: [], cargos: [], incidents: [], topDrivers: [] });
      setSampGangOverview(go.items || []);
      setSampLiveOpsPresets(presets.items || []);
      setSampTerritories(territories.items || []);
      setSampLiveOps(lo.config || {
        active_event_name: "",
        active_event_message: "",
        business_income_multiplier: 1,
        business_run_multiplier: 1,
        gang_support_cost_multiplier: 1,
        rep_multiplier: 1,
      });
    } catch (e) {
      setSampError(formatApiError(e, "Failed to load SA-MP Life data"));
    }
  }

  async function inspectSampUser(userId) {
    if (!userId) return;
    setSampError("");
    try {
      const data = await panelApi.sampLifeUser(bot.key, userId);
      setSampUserDetails(data || null);
      setSampUserId(userId);
    } catch (e) {
      setSampError(formatApiError(e, "Failed to inspect SA-MP user"));
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
          <SectionCard title="SA-MP Live Ops" icon={RefreshCw} description="Tune economy multipliers and announce temporary events without a code deploy.">
            {sampLiveOps.active_event_name ? (
              <Alert type="success">
                Active event: <strong>{sampLiveOps.active_event_name}</strong>
                {sampLiveOps.active_event_message ? ` - ${sampLiveOps.active_event_message}` : ""}
              </Alert>
            ) : null}
            <div className="grid grid-2 mb-4">
              <input
                placeholder="Active event name"
                value={sampLiveOps.active_event_name || ""}
                onChange={(e) => setSampLiveOps((p) => ({ ...p, active_event_name: e.target.value }))}
              />
              <input
                placeholder="Short event message"
                value={sampLiveOps.active_event_message || ""}
                onChange={(e) => setSampLiveOps((p) => ({ ...p, active_event_message: e.target.value }))}
              />
              <input
                placeholder="Business income multiplier"
                type="number"
                min="0"
                max="5"
                step="0.05"
                value={sampLiveOps.business_income_multiplier}
                onChange={(e) => setSampLiveOps((p) => ({ ...p, business_income_multiplier: Number(e.target.value) }))}
              />
              <input
                placeholder="Business run multiplier"
                type="number"
                min="0"
                max="5"
                step="0.05"
                value={sampLiveOps.business_run_multiplier}
                onChange={(e) => setSampLiveOps((p) => ({ ...p, business_run_multiplier: Number(e.target.value) }))}
              />
              <input
                placeholder="Gang support cost multiplier"
                type="number"
                min="0"
                max="5"
                step="0.05"
                value={sampLiveOps.gang_support_cost_multiplier}
                onChange={(e) => setSampLiveOps((p) => ({ ...p, gang_support_cost_multiplier: Number(e.target.value) }))}
              />
              <input
                placeholder="Rep multiplier"
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={sampLiveOps.rep_multiplier}
                onChange={(e) => setSampLiveOps((p) => ({ ...p, rep_multiplier: Number(e.target.value) }))}
              />
            </div>
            <div className="row-actions">
              <button
                onClick={async () => {
                  try {
                    const saved = await panelApi.saveSampLifeLiveOps(bot.key, { config: sampLiveOps });
                    setSampLiveOps(saved.config || sampLiveOps);
                    flash(setSampSuccess, "SA-MP live ops updated.");
                    await loadSamp();
                  } catch (e) {
                    setSampError(formatApiError(e, "Failed to save SA-MP live ops"));
                  }
                }}
              >
                <Save size={13} /> Save live ops
              </button>
              <span className="text-muted text-sm">
                Current multipliers: income {Number(sampLiveOps.business_income_multiplier || 1).toFixed(2)}x, runs {Number(sampLiveOps.business_run_multiplier || 1).toFixed(2)}x, rep {Number(sampLiveOps.rep_multiplier || 1).toFixed(2)}x.
              </span>
            </div>

            <div className="grid grid-2" style={{ marginTop: 16 }}>
              <SectionCard title="Saved Presets" icon={Save} description="Keep reusable weekend, holiday, and special event setups ready for one-click rollout.">
                <div className="row-actions mb-4">
                  <input
                    placeholder="Preset name"
                    value={sampPresetForm.name}
                    onChange={(e) => setSampPresetForm((p) => ({ ...p, name: e.target.value }))}
                  />
                  <select
                    value={sampPresetForm.preset_type}
                    onChange={(e) => setSampPresetForm((p) => ({ ...p, preset_type: e.target.value }))}
                  >
                    <option value="weekend">Weekend</option>
                    <option value="holiday">Holiday</option>
                    <option value="special">Special Event</option>
                    <option value="custom">Custom</option>
                  </select>
                  <button
                    onClick={async () => {
                      try {
                        const saved = await panelApi.saveSampLifeLiveOpsPreset(bot.key, {
                          preset: {
                            ...sampPresetForm,
                            config: sampLiveOps,
                          },
                        });
                        setSampLiveOpsPresets(saved.items || []);
                        setSampPresetForm({ name: "", preset_type: "weekend" });
                        flash(setSampSuccess, "Live ops preset saved.");
                      } catch (e) {
                        setSampError(formatApiError(e, "Failed to save live ops preset"));
                      }
                    }}
                  >
                    <Save size={13} /> Save current as preset
                  </button>
                </div>
                {sampLiveOpsPresets.length === 0 ? (
                  <EmptyState icon={Save} title="No presets saved" />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Name</th><th>Type</th><th>Event</th><th>Income</th><th>Runs</th><th>Rep</th><th></th></tr></thead>
                      <tbody>
                        {sampLiveOpsPresets.map((preset) => (
                          <tr key={preset.id}>
                            <td>{preset.name}{preset.is_default ? " *" : ""}</td>
                            <td>{preset.preset_type}</td>
                            <td>{preset.config?.active_event_name || "—"}</td>
                            <td>{Number(preset.config?.business_income_multiplier || 1).toFixed(2)}x</td>
                            <td>{Number(preset.config?.business_run_multiplier || 1).toFixed(2)}x</td>
                            <td>{Number(preset.config?.rep_multiplier || 1).toFixed(2)}x</td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="btn--ghost btn--sm"
                                  onClick={async () => {
                                    try {
                                      const applied = await panelApi.applySampLifeLiveOpsPreset(bot.key, preset.id);
                                      setSampLiveOps(applied.config || sampLiveOps);
                                      flash(setSampSuccess, `Preset applied: ${preset.name}.`);
                                      await loadSamp();
                                    } catch (e) {
                                      setSampError(formatApiError(e, "Failed to apply live ops preset"));
                                    }
                                  }}
                                >
                                  Apply
                                </button>
                                <button
                                  className="btn--icon btn--danger-icon"
                                  title="Delete"
                                  onClick={async () => {
                                    try {
                                      const deleted = await panelApi.deleteSampLifeLiveOpsPreset(bot.key, preset.id);
                                      setSampLiveOpsPresets(deleted.items || []);
                                      flash(setSampSuccess, `Preset deleted: ${preset.name}.`);
                                    } catch (e) {
                                      setSampError(formatApiError(e, "Failed to delete live ops preset"));
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

              <SectionCard title="Territory Control" icon={Map} description="Track which gangs own districts and how many businesses are getting the local buff.">
                {sampTerritories.length === 0 ? (
                  <EmptyState icon={Map} title="No territory data" />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>District</th><th>Controller</th><th>Pressure</th><th>Buff</th><th>Businesses</th><th>Controlled</th></tr></thead>
                      <tbody>
                        {sampTerritories.map((territory) => (
                          <tr key={territory.district_id}>
                            <td>{territory.district_name}</td>
                            <td>{territory.gang_name ? `[${territory.gang_tag}] ${territory.gang_name}` : "Neutral"}</td>
                            <td>{territory.pressure}%</td>
                            <td>+{territory.business_buff_pct}%</td>
                            <td>{territory.owned_businesses}/{territory.business_count}</td>
                            <td>{territory.controlled_businesses}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>
          </SectionCard>

          <SectionCard title="Business Economy Overview" icon={Building2} description="Monitor the health of the business economy and identify where manual balancing is needed.">
            <div className="grid grid-3 mb-4">
              <div className="card stat-card">
                <div className="stat-card__label">Businesses Owned</div>
                <div className="stat-card__value">{sampBusinessOverview.summary?.total_businesses || 0}</div>
              </div>
              <div className="card stat-card">
                <div className="stat-card__label">Active Owners</div>
                <div className="stat-card__value">{sampBusinessOverview.summary?.total_owners || 0}</div>
              </div>
              <div className="card stat-card">
                <div className="stat-card__label">Avg Condition</div>
                <div className="stat-card__value">{Number(sampBusinessOverview.summary?.avg_condition || 0).toFixed(1)}%</div>
              </div>
              <div className="card stat-card">
                <div className="stat-card__label">Avg Supplies</div>
                <div className="stat-card__value">{Number(sampBusinessOverview.summary?.avg_supplies || 0).toFixed(1)}%</div>
              </div>
              <div className="card stat-card">
                <div className="stat-card__label">At Risk</div>
                <div className="stat-card__value">{sampBusinessOverview.summary?.at_risk || 0}</div>
              </div>
              <div className="card stat-card">
                <div className="stat-card__label">Gang-Boosted</div>
                <div className="stat-card__value">{sampBusinessOverview.summary?.boosted_businesses || 0}</div>
              </div>
            </div>

            <div className="grid grid-2">
              <SectionCard title="Business Distribution" icon={Building2}>
                {(sampBusinessOverview.distribution || []).length === 0 ? (
                  <EmptyState icon={Building2} title="No businesses yet" />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Business</th><th>District</th><th>Owned</th><th>Avg cond.</th><th>Avg supply</th><th>Total collected</th></tr></thead>
                      <tbody>
                        {(sampBusinessOverview.distribution || []).map((row) => (
                          <tr key={row.property_id}>
                            <td>{row.property_id}</td>
                            <td>{row.district_name || row.district || "—"}</td>
                            <td>{row.owned}</td>
                            <td>{row.avg_condition}%</td>
                            <td>{row.avg_supplies}%</td>
                            <td>{row.total_collected}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Top Owners" icon={Users}>
                {(sampBusinessOverview.topOwners || []).length === 0 ? (
                  <EmptyState icon={Users} title="No owners yet" />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>User</th><th>Businesses</th><th>Total collected</th><th>Avg cond.</th><th>Avg supply</th></tr></thead>
                      <tbody>
                        {(sampBusinessOverview.topOwners || []).map((row) => (
                          <tr key={row.user_id}>
                            <td>{row.user_id}</td>
                            <td>{row.businesses_owned}</td>
                            <td>{row.total_collected}</td>
                            <td>{row.avg_condition}%</td>
                            <td>{row.avg_supplies}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>

            <SectionCard title="Businesses At Risk" icon={Target}>
              {(sampBusinessOverview.atRisk || []).length === 0 ? (
                <EmptyState icon={Target} title="No businesses at risk" />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>User</th><th>Business</th><th>Condition</th><th>Supplies</th><th>Gang boost</th><th></th></tr></thead>
                    <tbody>
                      {(sampBusinessOverview.atRisk || []).map((row) => (
                        <tr key={`${row.user_id}-${row.property_id}`}>
                          <td>{row.user_id}</td>
                          <td>{row.property_id}</td>
                          <td>{row.condition}%</td>
                          <td>{row.supplies}%</td>
                          <td>{row.gang_boost_until ? "yes" : "no"}</td>
                          <td>
                            <button className="btn--ghost btn--sm" onClick={() => inspectSampUser(row.user_id)}>
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </SectionCard>

          <SectionCard title="Gang Business Support" icon={Shield} description="See which gangs have treasury to influence the economy and who is actively backing businesses.">
            {(sampGangOverview || []).length === 0 ? (
              <EmptyState icon={Shield} title="No gangs yet" />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Gang</th><th>Treasury</th><th>Territories</th><th>Members</th><th>Supported businesses</th></tr></thead>
                  <tbody>
                    {(sampGangOverview || []).map((row) => (
                      <tr key={row.id}>
                        <td>[{row.tag}] {row.name}</td>
                        <td>{row.treasury}</td>
                        <td>{row.territories || 0}</td>
                        <td>{row.members}</td>
                        <td>{row.supported_businesses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Truck Analytics" icon={Map} description="Dedicated truck contract telemetry for balancing payout bands, route risk, and incident frequency.">
            <div className="grid grid-4 mb-4">
              <div className="card stat-card">
                <div className="stat-card__label">Runs</div>
                <div className="stat-card__value">{sampTruckOverview.summary?.total_runs ?? 0}</div>
              </div>
              <div className="card stat-card">
                <div className="stat-card__label">Crash rate</div>
                <div className="stat-card__value">{sampTruckOverview.summary?.real_crash_pct ?? 0}%</div>
              </div>
              <div className="card stat-card">
                <div className="stat-card__label">Total net</div>
                <div className="stat-card__value">{sampTruckOverview.summary?.total_net ?? 0}</div>
              </div>
              <div className="card stat-card">
                <div className="stat-card__label">Avg success payout</div>
                <div className="stat-card__value">{sampTruckOverview.summary?.avg_success_payout ?? 0}</div>
              </div>
            </div>

            <div className="grid grid-2">
              <SectionCard title="Routes" icon={Map}>
                {(sampTruckOverview.routes || []).length === 0 ? (
                  <EmptyState icon={Map} title="No truck runs yet" />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Route</th><th>Runs</th><th>Crashes</th><th>Crash %</th><th>Avg net</th><th>Total net</th></tr></thead>
                      <tbody>
                        {(sampTruckOverview.routes || []).map((row) => (
                          <tr key={row.route_id}>
                            <td>{row.route_name}</td>
                            <td>{row.runs}</td>
                            <td>{row.crashes}</td>
                            <td>{row.crash_rate_pct ?? 0}%</td>
                            <td>{row.avg_net ?? 0}</td>
                            <td>{row.total_net ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Top Drivers" icon={Users}>
                {(sampTruckOverview.topDrivers || []).length === 0 ? (
                  <EmptyState icon={Users} title="No truck leaders yet" />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>User</th><th>Runs</th><th>Crashes</th><th>Total net</th><th>Avg net</th><th>Last run</th></tr></thead>
                      <tbody>
                        {(sampTruckOverview.topDrivers || []).map((row) => (
                          <tr key={row.user_id}>
                            <td>{row.user_id}</td>
                            <td>{row.runs}</td>
                            <td>{row.crashes}</td>
                            <td>{row.total_net ?? 0}</td>
                            <td>{row.avg_net ?? 0}</td>
                            <td>{row.last_run_at || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>

            <div className="grid grid-2 mt-4">
              <SectionCard title="Cargo Mix" icon={Building2}>
                {(sampTruckOverview.cargos || []).length === 0 ? (
                  <EmptyState icon={Building2} title="No cargo data" />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Cargo</th><th>Runs</th><th>Crashes</th><th>Crash %</th><th>Total net</th></tr></thead>
                      <tbody>
                        {(sampTruckOverview.cargos || []).map((row) => (
                          <tr key={row.cargo_id}>
                            <td>{row.cargo_name}</td>
                            <td>{row.runs}</td>
                            <td>{row.crashes}</td>
                            <td>{row.crash_rate_pct ?? 0}%</td>
                            <td>{row.total_net ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Incident Mix" icon={RefreshCw}>
                {(sampTruckOverview.incidents || []).length === 0 ? (
                  <EmptyState icon={RefreshCw} title="No incident data" />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Incident</th><th>Runs</th><th>Crashes</th><th>Crash %</th><th>Total net</th></tr></thead>
                      <tbody>
                        {(sampTruckOverview.incidents || []).map((row) => (
                          <tr key={row.incident_id}>
                            <td>{row.incident_name}</td>
                            <td>{row.runs}</td>
                            <td>{row.crashes}</td>
                            <td>{row.crash_rate_pct ?? 0}%</td>
                            <td>{row.total_net ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>
          </SectionCard>

          <SectionCard title="Turf Wars & Live Ops History" icon={History} description="Recent district takeovers, gang support actions, presets, and manual economy changes.">
            {sampHistory.length === 0 ? (
              <EmptyState icon={History} title="No recent gameplay history" />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Time</th><th>Category</th><th>Event</th><th>Actor</th><th>Target</th><th>Amount</th></tr></thead>
                  <tbody>
                    {sampHistory.map((row) => (
                      <tr key={row.id}>
                        <td>{row.ts}</td>
                        <td>{row.category}</td>
                        <td>{row.summary}</td>
                        <td>{row.actor || row.from_user || "—"}</td>
                        <td>{row.target || row.to_user || "—"}</td>
                        <td>{row.amount || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

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
                    if (sampUserId) await inspectSampUser(sampUserId);
                  } catch (e) {
                    setSampError(formatApiError(e, "Failed to apply adjustment"));
                  }
                }}
              >
                Apply
              </button>
              <button className="btn--ghost" onClick={() => inspectSampUser(sampUserId)}>
                Inspect
              </button>
            </div>
            {sampUsers.length === 0 ? (
              <EmptyState icon={Map} title="No SA-MP Life data" />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>User</th><th>Money</th><th>Rep</th><th>Businesses</th><th>Truck net</th><th>Truck runs</th><th>Jail until</th><th></th></tr></thead>
                  <tbody>
                    {sampUsers.map((r) => (
                      <tr key={r.user_id}>
                        <td>{r.user_id}</td>
                        <td>{r.money}</td>
                        <td>{r.rep}</td>
                        <td>{r.businesses_owned || 0}</td>
                        <td>{r.truck_net ?? 0}</td>
                        <td>{r.truck_runs ?? 0}</td>
                        <td>{r.jail_until || "—"}</td>
                        <td>
                          <button className="btn--ghost btn--sm" onClick={() => inspectSampUser(r.user_id)}>
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {sampUserDetails && (
            <SectionCard title={`SA-MP User Details: ${sampUserDetails.user?.user_id || sampUserId}`} icon={Map} description="Inventory, cooldowns, business state, and truck telemetry for the selected player.">
              <div className="grid grid-4 mb-4">
                <div className="card stat-card">
                  <div className="stat-card__label">Money</div>
                  <div className="stat-card__value">{sampUserDetails.user?.money ?? 0}</div>
                </div>
                <div className="card stat-card">
                  <div className="stat-card__label">Rep</div>
                  <div className="stat-card__value">{sampUserDetails.user?.rep ?? 0}</div>
                </div>
                <div className="card stat-card">
                  <div className="stat-card__label">Businesses</div>
                  <div className="stat-card__value">{(sampUserDetails.businesses || []).length}</div>
                </div>
                <div className="card stat-card">
                  <div className="stat-card__label">Truck net</div>
                  <div className="stat-card__value">{sampUserDetails.truckStats?.net_total ?? 0}</div>
                </div>
              </div>

              <div className="grid grid-4 mb-4">
                <div className="card stat-card">
                  <div className="stat-card__label">Truck runs</div>
                  <div className="stat-card__value">{sampUserDetails.truckStats?.total_runs ?? 0}</div>
                </div>
                <div className="card stat-card">
                  <div className="stat-card__label">Crash rate</div>
                  <div className="stat-card__value">{sampUserDetails.truckStats?.real_crash_pct ?? 0}%</div>
                </div>
                <div className="card stat-card">
                  <div className="stat-card__label">Best run</div>
                  <div className="stat-card__value">{sampUserDetails.truckStats?.best_run ?? 0}</div>
                </div>
                <div className="card stat-card">
                  <div className="stat-card__label">Worst run</div>
                  <div className="stat-card__value">{sampUserDetails.truckStats?.worst_run ?? 0}</div>
                </div>
              </div>

              <div className="grid grid-2 mb-4">
                <SectionCard title="Truck Summary" icon={Map}>
                  <div className="table-wrap">
                    <table className="data-table">
                      <tbody>
                        <tr><th>Total earnings</th><td>{sampUserDetails.truckStats?.total_earnings ?? 0}</td></tr>
                        <tr><th>Total losses</th><td>{sampUserDetails.truckStats?.total_losses ?? 0}</td></tr>
                        <tr><th>Avg net</th><td>{sampUserDetails.truckStats?.avg_net ?? 0}</td></tr>
                        <tr><th>Favorite route</th><td>{sampUserDetails.truckStats?.favorite_route?.route_name || "—"}</td></tr>
                        <tr><th>Favorite cargo</th><td>{sampUserDetails.truckStats?.favorite_cargo?.cargo_name || "—"}</td></tr>
                        <tr><th>Last run</th><td>{sampUserDetails.truckStats?.last_run_at || "—"}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </SectionCard>

                <SectionCard title="Recent Truck Runs" icon={RefreshCw}>
                  {(sampUserDetails.recentTruckRuns || []).length === 0 ? (
                    <EmptyState icon={RefreshCw} title="No truck runs yet" />
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Time</th><th>Route</th><th>Cargo</th><th>Incident</th><th>Result</th><th>Net</th></tr></thead>
                        <tbody>
                          {(sampUserDetails.recentTruckRuns || []).map((row) => (
                            <tr key={row.id}>
                              <td>{row.created_at}</td>
                              <td>{row.route_name}</td>
                              <td>{row.cargo_name}</td>
                              <td>{row.incident_name}</td>
                              <td>{row.crashed ? "Crash" : "Success"}</td>
                              <td>{row.net_amount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="grid grid-2">
                <SectionCard title="Businesses" icon={Building2}>
                  {(sampUserDetails.businesses || []).length === 0 ? (
                    <EmptyState icon={Building2} title="No businesses owned" />
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Business</th><th>District</th><th>Condition</th><th>Supplies</th><th>Total collected</th><th>Gang boost</th><th>Territory</th></tr></thead>
                        <tbody>
                          {(sampUserDetails.businesses || []).map((row) => (
                            <tr key={row.property_id}>
                              <td>{row.property_id}</td>
                              <td>{row.district_name || row.district || "—"}</td>
                              <td>{row.condition}%</td>
                              <td>{row.supplies}%</td>
                              <td>{row.total_collected}</td>
                              <td>{row.gang_boost_until || "—"}</td>
                              <td>{row.territory_gang_name ? `${row.territory_gang_name} (+${row.territory_buff_pct}%)` : "Neutral"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="Cooldowns" icon={RefreshCw}>
                  {(sampUserDetails.cooldowns || []).length === 0 ? (
                    <EmptyState icon={RefreshCw} title="No cooldowns" />
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Action</th><th>Ready at</th></tr></thead>
                        <tbody>
                          {(sampUserDetails.cooldowns || []).map((row) => (
                            <tr key={row.action}>
                              <td>{row.action}</td>
                              <td>{row.ready_at}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              </div>
            </SectionCard>
          )}

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
