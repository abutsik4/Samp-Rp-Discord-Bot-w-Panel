import { useEffect, useState } from "react";
import { panelApi, formatApiError } from "../../lib/api";

function flash(setFn, msg) {
  setFn(msg);
  setTimeout(() => setFn(""), 4000);
}

export function useGameplayData(bot) {
  // ─── Levels ─────────────────────────────────────────────────────────────
  const [levels, setLevels] = useState([]);
  const [levelsError, setLevelsError] = useState("");
  const [levelsUserId, setLevelsUserId] = useState("");
  const [levelSetXp, setLevelSetXp] = useState(0);

  async function loadLevels() {
    setLevelsError("");
    try {
      const r = await panelApi.gameplayLevels(bot.key, { limit: 100 });
      setLevels(r.items || []);
    } catch (e) {
      setLevelsError(formatApiError(e, "Failed to load levels"));
    }
  }

  async function setLevelXp(userId, xp) {
    try {
      await panelApi.setGameplayLevel(bot.key, { userId, xp });
      await loadLevels();
    } catch (e) {
      setLevelsError(formatApiError(e, "Failed to set XP"));
    }
  }

  // ─── Badges ──────────────────────────────────────────────────────────────
  const [badgeUsers, setBadgeUsers] = useState([]);
  const [badgeDefs, setBadgeDefs] = useState([]);
  const [badgesError, setBadgesError] = useState("");
  const [badgesSuccess, setBadgesSuccess] = useState("");
  const [selectedBadgeUserId, setSelectedBadgeUserId] = useState("");
  const [selectedBadge, setSelectedBadge] = useState("");
  const [badgeEdit, setBadgeEdit] = useState({
    id: "",
    type: "messages",
    threshold: 0,
    name: "",
    emoji: "🏅",
    description: "",
    enabled: true,
    sort_order: 0,
  });

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

  async function grantBadge(userId, badgeId) {
    try {
      await panelApi.grantBadge(bot.key, userId, { badgeId });
      flash(setBadgesSuccess, "Badge granted.");
      await loadBadges();
    } catch (e) {
      setBadgesError(formatApiError(e, "Failed to grant badge"));
    }
  }

  async function seedBadgeDefinitions() {
    try {
      const r = await panelApi.seedBadgeDefinitions(bot.key);
      const count = r?.count ?? r?.seeded ?? "default";
      flash(setBadgesSuccess, `Seeded ${count} badge definitions.`);
      await loadBadges();
    } catch (e) {
      setBadgesError(formatApiError(e, "Failed to seed badges"));
    }
  }

  async function upsertBadgeDefinition(definition) {
    try {
      await panelApi.upsertBadgeDefinition(bot.key, definition);
      setBadgeEdit({
        id: "",
        type: "messages",
        threshold: 0,
        name: "",
        emoji: "🏅",
        description: "",
        enabled: true,
        sort_order: 0,
      });
      flash(setBadgesSuccess, "Badge definition saved.");
      await loadBadges();
    } catch (e) {
      setBadgesError(formatApiError(e, "Failed to save badge definition"));
    }
  }

  async function deleteBadgeDefinition(badgeId) {
    try {
      await panelApi.deleteBadgeDefinition(bot.key, badgeId);
      await loadBadges();
    } catch (e) {
      setBadgesError(formatApiError(e, "Failed to delete badge definition"));
    }
  }

  // ─── Perks ──────────────────────────────────────────────────────────────
  const [perkRules, setPerkRules] = useState([]);
  const [perksError, setPerksError] = useState("");
  const [perksSuccess, setPerksSuccess] = useState("");
  const [perkForm, setPerkForm] = useState({
    trigger_type: "badge",
    trigger_value: "",
    action_type: "grant_role",
    action_value: "",
    enabled: true,
  });

  async function loadPerks() {
    setPerksError("");
    try {
      const r = await panelApi.perkRules(bot.key);
      setPerkRules(r.items || []);
    } catch (e) {
      setPerksError(formatApiError(e, "Failed to load perk rules"));
    }
  }

  async function reconcilePerks() {
    try {
      const r = await panelApi.reconcilePerks(bot.key, { limit: 200 });
      flash(setPerksSuccess, `Perks reconciled: ${r?.applied ?? 0} grants applied.`);
    } catch (e) {
      setPerksError(formatApiError(e, "Failed to reconcile perks"));
    }
  }

  async function upsertPerkRule(rule) {
    try {
      await panelApi.upsertPerkRule(bot.key, rule);
      setPerkForm({
        trigger_type: "badge",
        trigger_value: "",
        action_type: "grant_role",
        action_value: "",
        enabled: true,
      });
      flash(setPerksSuccess, "Perk rule saved.");
      await loadPerks();
    } catch (e) {
      setPerksError(formatApiError(e, "Failed to save perk rule"));
    }
  }

  async function deletePerkRule(ruleId) {
    try {
      await panelApi.deletePerkRule(bot.key, ruleId);
      await loadPerks();
    } catch (e) {
      setPerksError(formatApiError(e, "Failed to delete rule"));
    }
  }

  // ─── XP Multipliers ─────────────────────────────────────────────────────
  const [xpMultipliers, setXpMultipliers] = useState([]);
  const [xpError, setXpError] = useState("");
  const [xpSuccess, setXpSuccess] = useState("");
  const [xpForm, setXpForm] = useState({ roleId: "", multiplier: 1.0 });

  async function loadXpMultipliers() {
    setXpError("");
    try {
      const r = await panelApi.xpMultipliers(bot.key);
      setXpMultipliers(r.items || []);
    } catch (e) {
      setXpError(formatApiError(e, "Failed to load XP multipliers"));
    }
  }

  async function upsertXpMultiplier(form) {
    try {
      await panelApi.upsertXpMultiplier(bot.key, form);
      setXpForm({ roleId: "", multiplier: 1.0 });
      flash(setXpSuccess, "XP multiplier saved.");
      await loadXpMultipliers();
    } catch (e) {
      setXpError(formatApiError(e, "Failed to save XP multiplier"));
    }
  }

  async function deleteXpMultiplier(roleId) {
    try {
      await panelApi.deleteXpMultiplier(bot.key, roleId);
      await loadXpMultipliers();
    } catch (e) {
      setXpError(formatApiError(e, "Failed to delete multiplier"));
    }
  }

  // ─── Roles ──────────────────────────────────────────────────────────────
  const [roles, setRoles] = useState([]);
  const [rolesError, setRolesError] = useState("");
  const [roleForm, setRoleForm] = useState({ name: "", mentionable: false, hoist: false });
  const [roleSuccess, setRoleSuccess] = useState("");
  const [roleError, setRoleError] = useState("");

  async function loadRoles() {
    setRolesError("");
    try {
      const r = await panelApi.roles(bot.key, bot.guild_id);
      setRoles(r.roles || []);
    } catch (e) {
      setRolesError(formatApiError(e, "Failed to load Discord roles"));
    }
  }

  async function createRole(form) {
    try {
      await panelApi.createRole(bot.key, { guildId: bot.guild_id, ...form });
      setRoleForm({ name: "", mentionable: false, hoist: false });
      flash(setRoleSuccess, `Role "${form.name}" created.`);
      await loadRoles();
    } catch (e) {
      setRoleError(formatApiError(e, "Failed to create role"));
    }
  }

  // ─── Trivia ─────────────────────────────────────────────────────────────
  const [trivia, setTrivia] = useState([]);
  const [triviaError, setTriviaError] = useState("");
  const [triviaUserId, setTriviaUserId] = useState("");

  async function loadTrivia() {
    setTriviaError("");
    try {
      const r = await panelApi.triviaLeaderboard(bot.key, { limit: 100 });
      setTrivia(r.items || []);
    } catch (e) {
      setTriviaError(formatApiError(e, "Failed to load trivia data"));
    }
  }

  async function resetTriviaUser(userId) {
    try {
      await panelApi.resetTriviaUser(bot.key, { userId });
      await loadTrivia();
    } catch (e) {
      setTriviaError(formatApiError(e, "Failed to reset trivia"));
    }
  }

  // ─── Wanted ─────────────────────────────────────────────────────────────
  const [wanted, setWanted] = useState([]);
  const [wantedError, setWantedError] = useState("");
  const [wantedUserId, setWantedUserId] = useState("");
  const [wantedStars, setWantedStars] = useState(0);

  async function loadWanted() {
    setWantedError("");
    try {
      const r = await panelApi.wantedList(bot.key, { limit: 100 });
      setWanted(r.items || []);
    } catch (e) {
      setWantedError(formatApiError(e, "Failed to load wanted list"));
    }
  }

  async function setWantedStarsAction(userId, stars) {
    try {
      await panelApi.setWanted(bot.key, { userId, stars });
      await loadWanted();
    } catch (e) {
      setWantedError(formatApiError(e, "Failed to set stars"));
    }
  }

  async function clearWanted(userId) {
    try {
      await panelApi.clearWanted(bot.key, { userId });
      await loadWanted();
    } catch (e) {
      setWantedError(formatApiError(e, "Failed to clear stars"));
    }
  }

  // ─── Radio ──────────────────────────────────────────────────────────────
  const [radio, setRadio] = useState({ totalVotes: 0, items: [] });
  const [radioError, setRadioError] = useState("");
  const [radioUserId, setRadioUserId] = useState("");

  async function loadRadio() {
    setRadioError("");
    try {
      const r = await panelApi.radioResults(bot.key);
      setRadio(r || { totalVotes: 0, items: [] });
    } catch (e) {
      setRadioError(formatApiError(e, "Failed to load radio votes"));
    }
  }

  async function resetRadio(userId) {
    try {
      await panelApi.resetRadio(bot.key, { userId: userId || undefined });
      await loadRadio();
    } catch (e) {
      setRadioError(formatApiError(e, "Failed to reset votes"));
    }
  }

  // ─── SA-MP Life ─────────────────────────────────────────────────────────
  const [sampUsers, setSampUsers] = useState([]);
  const [sampLedger, setSampLedger] = useState([]);
  const [sampError, setSampError] = useState("");
  const [sampSuccess, setSampSuccess] = useState("");
  const [sampUserId, setSampUserId] = useState("");
  const [sampAdjust, setSampAdjust] = useState({ moneyDelta: 0, repDelta: 0, jailMinutes: 0 });
  const [sampBusinessOverview, setSampBusinessOverview] = useState({
    summary: {},
    distribution: [],
    topOwners: [],
    atRisk: [],
  });
  const [sampTruckOverview, setSampTruckOverview] = useState({
    summary: {},
    routes: [],
    cargos: [],
    incidents: [],
    topDrivers: [],
  });
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

  async function adjustSampUser(userId, adjustment) {
    try {
      await panelApi.adjustSampLifeUser(bot.key, userId, adjustment);
      flash(setSampSuccess, "Adjustment applied.");
      await loadSamp();
      if (userId) await inspectSampUser(userId);
    } catch (e) {
      setSampError(formatApiError(e, "Failed to apply adjustment"));
    }
  }

  async function saveSampLiveOps(config) {
    try {
      const saved = await panelApi.saveSampLifeLiveOps(bot.key, { config });
      setSampLiveOps(saved.config || config);
      flash(setSampSuccess, "SA-MP live ops updated.");
      await loadSamp();
    } catch (e) {
      setSampError(formatApiError(e, "Failed to save SA-MP live ops"));
    }
  }

  async function saveSampLiveOpsPreset(presetForm, config) {
    try {
      const saved = await panelApi.saveSampLifeLiveOpsPreset(bot.key, {
        preset: { ...presetForm, config },
      });
      setSampLiveOpsPresets(saved.items || []);
      setSampPresetForm({ name: "", preset_type: "weekend" });
      flash(setSampSuccess, "Live ops preset saved.");
    } catch (e) {
      setSampError(formatApiError(e, "Failed to save live ops preset"));
    }
  }

  async function applySampLiveOpsPreset(preset) {
    try {
      const applied = await panelApi.applySampLifeLiveOpsPreset(bot.key, preset.id);
      setSampLiveOps(applied.config || sampLiveOps);
      flash(setSampSuccess, `Preset applied: ${preset.name}.`);
      await loadSamp();
    } catch (e) {
      setSampError(formatApiError(e, "Failed to apply live ops preset"));
    }
  }

  async function deleteSampLiveOpsPreset(preset) {
    try {
      const deleted = await panelApi.deleteSampLifeLiveOpsPreset(bot.key, preset.id);
      setSampLiveOpsPresets(deleted.items || []);
      flash(setSampSuccess, `Preset deleted: ${preset.name}.`);
    } catch (e) {
      setSampError(formatApiError(e, "Failed to delete live ops preset"));
    }
  }

  // ─── Initial load ───────────────────────────────────────────────────────
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

  return {
    // Levels
    levels,
    levelsError,
    levelsUserId,
    setLevelsUserId,
    levelSetXp,
    setLevelSetXp,
    setLevelXp,

    // Badges
    badgeUsers,
    badgeDefs,
    badgesError,
    badgesSuccess,
    selectedBadgeUserId,
    setSelectedBadgeUserId,
    selectedBadge,
    setSelectedBadge,
    badgeEdit,
    setBadgeEdit,
    loadBadges,
    grantBadge,
    seedBadgeDefinitions,
    upsertBadgeDefinition,
    deleteBadgeDefinition,

    // Perks
    perkRules,
    perksError,
    perksSuccess,
    perkForm,
    setPerkForm,
    loadPerks,
    reconcilePerks,
    upsertPerkRule,
    deletePerkRule,

    // XP Multipliers
    xpMultipliers,
    xpError,
    xpSuccess,
    xpForm,
    setXpForm,
    loadXpMultipliers,
    upsertXpMultiplier,
    deleteXpMultiplier,

    // Roles
    roles,
    rolesError,
    roleForm,
    setRoleForm,
    roleSuccess,
    roleError,
    loadRoles,
    createRole,

    // Trivia
    trivia,
    triviaError,
    triviaUserId,
    setTriviaUserId,
    loadTrivia,
    resetTriviaUser,

    // Wanted
    wanted,
    wantedError,
    wantedUserId,
    setWantedUserId,
    wantedStars,
    setWantedStars,
    loadWanted,
    setWantedStarsAction: setWantedStarsAction,
    clearWanted,

    // Radio
    radio,
    radioError,
    radioUserId,
    setRadioUserId,
    loadRadio,
    resetRadio,

    // SA-MP Life
    sampUsers,
    sampLedger,
    sampError,
    sampSuccess,
    sampUserId,
    setSampUserId,
    sampAdjust,
    setSampAdjust,
    sampBusinessOverview,
    sampTruckOverview,
    sampGangOverview,
    sampUserDetails,
    sampHistory,
    sampLiveOps,
    setSampLiveOps,
    sampLiveOpsPresets,
    setSampLiveOpsPresets,
    sampTerritories,
    sampPresetForm,
    setSampPresetForm,
    loadSamp,
    inspectSampUser,
    adjustSampUser,
    saveSampLiveOps,
    saveSampLiveOpsPreset,
    applySampLiveOpsPreset,
    deleteSampLiveOpsPreset,

    // Loaders for manual refresh
    loadLevels,
    loadRoles,
    loadTrivia,
    loadWanted,
    loadRadio,
  };
}