import { useState, lazy, Suspense } from "react";
import {
  Gamepad2, TrendingUp, Award, Zap, Star, Users,
  HelpCircle, Target, Radio, Map,
} from "lucide-react";
import { useGameplayData } from "./gameplays/useGameplayData";
import { PageHeader } from "../components/PageHeader";

const LevelsTab = lazy(() => import("./gameplays/LevelsTab").then(m => ({ default: m.LevelsTab })));
const BadgesTab = lazy(() => import("./gameplays/BadgesTab").then(m => ({ default: m.BadgesTab })));
const PerksTab = lazy(() => import("./gameplays/PerksTab").then(m => ({ default: m.PerksTab })));
const BoostsTab = lazy(() => import("./gameplays/BoostsTab").then(m => ({ default: m.BoostsTab })));
const TriviaTab = lazy(() => import("./gameplays/TriviaTab").then(m => ({ default: m.TriviaTab })));
const WantedTab = lazy(() => import("./gameplays/WantedTab").then(m => ({ default: m.WantedTab })));
const RadioTab = lazy(() => import("./gameplays/RadioTab").then(m => ({ default: m.RadioTab })));
const SampLifeTab = lazy(() => import("./gameplays/SampLifeTab").then(m => ({ default: m.SampLifeTab })));

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

function TabSkeleton() {
  return (
    <div style={{ display: "grid", gap: "var(--space-4)", paddingTop: "var(--space-4)" }}>
      <div className="skeleton skeleton-card" style={{ height: 80 }} />
      <div className="skeleton skeleton-card" style={{ height: 200 }} />
    </div>
  );
}

export function GameplayPage({ bot }) {
  const [tab, setTab] = useState("levels");
  const data = useGameplayData(bot);

  return (
    <div className="page">
      <PageHeader
        icon={Gamepad2}
        title="Gameplay Systems"
        subtitle="Manage levels, badges, perks, and in-game features."
      />

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

      <Suspense fallback={<TabSkeleton />}>
        {tab === "levels" && (
          <LevelsTab
            levels={data.levels}
            levelsError={data.levelsError}
            levelsUserId={data.levelsUserId}
            setLevelsUserId={data.setLevelsUserId}
            levelSetXp={data.levelSetXp}
            setLevelSetXp={data.setLevelSetXp}
            setLevelXp={data.setLevelXp}
          />
        )}

        {tab === "badges" && (
          <BadgesTab
            badgeUsers={data.badgeUsers}
            badgeDefs={data.badgeDefs}
            badgesError={data.badgesError}
            badgesSuccess={data.badgesSuccess}
            selectedBadgeUserId={data.selectedBadgeUserId}
            setSelectedBadgeUserId={data.setSelectedBadgeUserId}
            selectedBadge={data.selectedBadge}
            setSelectedBadge={data.setSelectedBadge}
            badgeEdit={data.badgeEdit}
            setBadgeEdit={data.setBadgeEdit}
            grantBadge={data.grantBadge}
            seedBadgeDefinitions={data.seedBadgeDefinitions}
            upsertBadgeDefinition={data.upsertBadgeDefinition}
            deleteBadgeDefinition={data.deleteBadgeDefinition}
          />
        )}

        {tab === "perks" && (
          <PerksTab
            perkRules={data.perkRules}
            perksError={data.perksError}
            perksSuccess={data.perksSuccess}
            roles={data.roles}
            rolesError={data.rolesError}
            badgeDefs={data.badgeDefs}
            perkForm={data.perkForm}
            setPerkForm={data.setPerkForm}
            reconcilePerks={data.reconcilePerks}
            upsertPerkRule={data.upsertPerkRule}
            deletePerkRule={data.deletePerkRule}
          />
        )}

        {tab === "boosts" && (
          <BoostsTab
            xpMultipliers={data.xpMultipliers}
            xpError={data.xpError}
            xpSuccess={data.xpSuccess}
            roles={data.roles}
            rolesError={data.rolesError}
            xpForm={data.xpForm}
            setXpForm={data.setXpForm}
            upsertXpMultiplier={data.upsertXpMultiplier}
            deleteXpMultiplier={data.deleteXpMultiplier}
            roleForm={data.roleForm}
            setRoleForm={data.setRoleForm}
            roleSuccess={data.roleSuccess}
            roleError={data.roleError}
            createRole={data.createRole}
          />
        )}

        {tab === "roles" && (
          <BoostsTab
            xpMultipliers={data.xpMultipliers}
            xpError={data.xpError}
            xpSuccess={data.xpSuccess}
            roles={data.roles}
            rolesError={data.rolesError}
            xpForm={data.xpForm}
            setXpForm={data.setXpForm}
            upsertXpMultiplier={data.upsertXpMultiplier}
            deleteXpMultiplier={data.deleteXpMultiplier}
            roleForm={data.roleForm}
            setRoleForm={data.setRoleForm}
            roleSuccess={data.roleSuccess}
            roleError={data.roleError}
            createRole={data.createRole}
          />
        )}

        {tab === "trivia" && (
          <TriviaTab
            trivia={data.trivia}
            triviaError={data.triviaError}
            triviaUserId={data.triviaUserId}
            setTriviaUserId={data.setTriviaUserId}
            resetTriviaUser={data.resetTriviaUser}
          />
        )}

        {tab === "wanted" && (
          <WantedTab
            wanted={data.wanted}
            wantedError={data.wantedError}
            wantedUserId={data.wantedUserId}
            setWantedUserId={data.setWantedUserId}
            wantedStars={data.wantedStars}
            setWantedStars={data.setWantedStars}
            setWantedStarsAction={data.setWantedStarsAction}
            clearWanted={data.clearWanted}
          />
        )}

        {tab === "radio" && (
          <RadioTab
            radio={data.radio}
            radioError={data.radioError}
            radioUserId={data.radioUserId}
            setRadioUserId={data.setRadioUserId}
            resetRadio={data.resetRadio}
          />
        )}

        {tab === "samplife" && (
          <SampLifeTab
            sampLiveOps={data.sampLiveOps}
            setSampLiveOps={data.setSampLiveOps}
            sampLiveOpsPresets={data.sampLiveOpsPresets}
            setSampLiveOpsPresets={data.setSampLiveOpsPresets}
            sampPresetForm={data.sampPresetForm}
            setSampPresetForm={data.setSampPresetForm}
            sampTerritories={data.sampTerritories}
            sampBusinessOverview={data.sampBusinessOverview}
            sampGangOverview={data.sampGangOverview}
            sampTruckOverview={data.sampTruckOverview}
            sampHistory={data.sampHistory}
            sampUsers={data.sampUsers}
            sampError={data.sampError}
            sampSuccess={data.sampSuccess}
            sampUserId={data.sampUserId}
            setSampUserId={data.setSampUserId}
            sampAdjust={data.sampAdjust}
            setSampAdjust={data.setSampAdjust}
            sampUserDetails={data.sampUserDetails}
            sampLedger={data.sampLedger}
            saveSampLiveOps={data.saveSampLiveOps}
            saveSampLiveOpsPreset={data.saveSampLiveOpsPreset}
            applySampLiveOpsPreset={data.applySampLiveOpsPreset}
            deleteSampLiveOpsPreset={data.deleteSampLiveOpsPreset}
            adjustSampUser={data.adjustSampUser}
            inspectSampUser={data.inspectSampUser}
          />
        )}
      </Suspense>
    </div>
  );
}