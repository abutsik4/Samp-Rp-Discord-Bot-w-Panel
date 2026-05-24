import { SectionCard } from "../../components/SectionCard";
import { Alert } from "../../components/Alert";
import { EmptyState } from "../../components/EmptyState";
import { RefreshCw, Save, Trash2, Map, Building2, Shield, Users, History } from "lucide-react";

export function SampLifeTab({
  sampLiveOps, setSampLiveOps,
  sampLiveOpsPresets, setSampLiveOpsPresets,
  sampPresetForm, setSampPresetForm,
  sampTerritories,
  sampBusinessOverview,
  sampGangOverview,
  sampTruckOverview,
  sampHistory,
  sampUsers, sampError, sampSuccess,
  sampUserId, setSampUserId,
  sampAdjust, setSampAdjust,
  sampUserDetails,
  sampLedger,
  saveSampLiveOps, saveSampLiveOpsPreset, applySampLiveOpsPreset, deleteSampLiveOpsPreset,
  adjustSampUser, inspectSampUser,
}) {
  return (
    <>
      {/* ── Live Ops + Presets + Territories ── */}
      <SectionCard title="SA-MP Live Ops" icon={RefreshCw} description="Tune economy multipliers and announce temporary events without a code deploy.">
        {sampLiveOps.active_event_name ? (
          <Alert type="success">
            Active event: <strong>{sampLiveOps.active_event_name}</strong>
            {sampLiveOps.active_event_message ? ` - ${sampLiveOps.active_event_message}` : ""}
          </Alert>
        ) : null}
        <div className="grid grid-2 mb-4">
          <input placeholder="Active event name" value={sampLiveOps.active_event_name || ""} onChange={(e) => setSampLiveOps((p) => ({ ...p, active_event_name: e.target.value }))} />
          <input placeholder="Short event message" value={sampLiveOps.active_event_message || ""} onChange={(e) => setSampLiveOps((p) => ({ ...p, active_event_message: e.target.value }))} />
          <input placeholder="Business income multiplier" type="number" min="0" max="5" step="0.05" value={sampLiveOps.business_income_multiplier} onChange={(e) => setSampLiveOps((p) => ({ ...p, business_income_multiplier: Number(e.target.value) }))} />
          <input placeholder="Business run multiplier" type="number" min="0" max="5" step="0.05" value={sampLiveOps.business_run_multiplier} onChange={(e) => setSampLiveOps((p) => ({ ...p, business_run_multiplier: Number(e.target.value) }))} />
          <input placeholder="Gang support cost multiplier" type="number" min="0" max="5" step="0.05" value={sampLiveOps.gang_support_cost_multiplier} onChange={(e) => setSampLiveOps((p) => ({ ...p, gang_support_cost_multiplier: Number(e.target.value) }))} />
          <input placeholder="Rep multiplier" type="number" min="0" max="10" step="0.1" value={sampLiveOps.rep_multiplier} onChange={(e) => setSampLiveOps((p) => ({ ...p, rep_multiplier: Number(e.target.value) }))} />
        </div>
        <div className="row-actions">
          <button onClick={() => saveSampLiveOps(sampLiveOps)}>
            <Save size={13} /> Save live ops
          </button>
          <span className="text-muted text-sm">
            Current multipliers: income {Number(sampLiveOps.business_income_multiplier || 1).toFixed(2)}x, runs {Number(sampLiveOps.business_run_multiplier || 1).toFixed(2)}x, rep {Number(sampLiveOps.rep_multiplier || 1).toFixed(2)}x.
          </span>
        </div>

        <div className="grid grid-2" style={{ marginTop: 16 }}>
          {/* Presets */}
          <SectionCard title="Saved Presets" icon={Save} description="Keep reusable weekend, holiday, and special event setups ready for one-click rollout.">
            <div className="row-actions mb-4">
              <input placeholder="Preset name" value={sampPresetForm.name} onChange={(e) => setSampPresetForm((p) => ({ ...p, name: e.target.value }))} />
              <select value={sampPresetForm.preset_type} onChange={(e) => setSampPresetForm((p) => ({ ...p, preset_type: e.target.value }))}>
                <option value="weekend">Weekend</option>
                <option value="holiday">Holiday</option>
                <option value="special">Special Event</option>
                <option value="custom">Custom</option>
              </select>
              <button onClick={() => saveSampLiveOpsPreset(sampPresetForm, sampLiveOps)}>
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
                            <button className="btn--ghost btn--sm" onClick={() => applySampLiveOpsPreset(preset)}>
                              Apply
                            </button>
                            <button className="btn--icon btn--danger-icon" title="Delete" onClick={() => deleteSampLiveOpsPreset(preset)}>
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

          {/* Territories */}
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

      {/* ── Business Overview ── */}
      <SectionCard title="Business Economy Overview" icon={Building2} description="Monitor the health of the business economy and identify where manual balancing is needed.">
        <div className="grid grid-3 mb-4">
          <div className="card stat-card"><div className="stat-card__label">Businesses Owned</div><div className="stat-card__value">{sampBusinessOverview.summary?.total_businesses || 0}</div></div>
          <div className="card stat-card"><div className="stat-card__label">Active Owners</div><div className="stat-card__value">{sampBusinessOverview.summary?.total_owners || 0}</div></div>
          <div className="card stat-card"><div className="stat-card__label">Avg Condition</div><div className="stat-card__value">{Number(sampBusinessOverview.summary?.avg_condition || 0).toFixed(1)}%</div></div>
          <div className="card stat-card"><div className="stat-card__label">Avg Supplies</div><div className="stat-card__value">{Number(sampBusinessOverview.summary?.avg_supplies || 0).toFixed(1)}%</div></div>
          <div className="card stat-card"><div className="stat-card__label">At Risk</div><div className="stat-card__value">{sampBusinessOverview.summary?.at_risk || 0}</div></div>
          <div className="card stat-card"><div className="stat-card__label">Gang-Boosted</div><div className="stat-card__value">{sampBusinessOverview.summary?.boosted_businesses || 0}</div></div>
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
                      <tr key={row.property_id}><td>{row.property_id}</td><td>{row.district_name || row.district || "—"}</td><td>{row.owned}</td><td>{row.avg_condition}%</td><td>{row.avg_supplies}%</td><td>{row.total_collected}</td></tr>
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
                      <tr key={row.user_id}><td>{row.user_id}</td><td>{row.businesses_owned}</td><td>{row.total_collected}</td><td>{row.avg_condition}%</td><td>{row.avg_supplies}%</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Businesses At Risk" icon={Map}>
          {(sampBusinessOverview.atRisk || []).length === 0 ? (
            <EmptyState icon={Map} title="No businesses at risk" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>User</th><th>Business</th><th>Condition</th><th>Supplies</th><th>Gang boost</th><th></th></tr></thead>
                <tbody>
                  {(sampBusinessOverview.atRisk || []).map((row) => (
                    <tr key={`${row.user_id}-${row.property_id}`}>
                      <td>{row.user_id}</td><td>{row.property_id}</td><td>{row.condition}%</td><td>{row.supplies}%</td>
                      <td>{row.gang_boost_until ? "yes" : "no"}</td>
                      <td><button className="btn--ghost btn--sm" onClick={() => inspectSampUser(row.user_id)}>Inspect</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </SectionCard>

      {/* ── Gang Overview ── */}
      <SectionCard title="Gang Business Support" icon={Shield} description="See which gangs have treasury to influence the economy and who is actively backing businesses.">
        {(sampGangOverview || []).length === 0 ? (
          <EmptyState icon={Shield} title="No gangs yet" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Gang</th><th>Treasury</th><th>Territories</th><th>Members</th><th>Supported businesses</th></tr></thead>
              <tbody>
                {(sampGangOverview || []).map((row) => (
                  <tr key={row.id}><td>[{row.tag}] {row.name}</td><td>{row.treasury}</td><td>{row.territories || 0}</td><td>{row.members}</td><td>{row.supported_businesses}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Truck Analytics ── */}
      <SectionCard title="Truck Analytics" icon={Map} description="Dedicated truck contract telemetry for balancing payout bands, route risk, and incident frequency.">
        <div className="grid grid-4 mb-4">
          <div className="card stat-card"><div className="stat-card__label">Runs</div><div className="stat-card__value">{sampTruckOverview.summary?.total_runs ?? 0}</div></div>
          <div className="card stat-card"><div className="stat-card__label">Crash rate</div><div className="stat-card__value">{sampTruckOverview.summary?.real_crash_pct ?? 0}%</div></div>
          <div className="card stat-card"><div className="stat-card__label">Total net</div><div className="stat-card__value">{sampTruckOverview.summary?.total_net ?? 0}</div></div>
          <div className="card stat-card"><div className="stat-card__label">Avg success payout</div><div className="stat-card__value">{sampTruckOverview.summary?.avg_success_payout ?? 0}</div></div>
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
                      <tr key={row.route_id}><td>{row.route_name}</td><td>{row.runs}</td><td>{row.crashes}</td><td>{row.crash_rate_pct ?? 0}%</td><td>{row.avg_net ?? 0}</td><td>{row.total_net ?? 0}</td></tr>
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
                      <tr key={row.user_id}><td>{row.user_id}</td><td>{row.runs}</td><td>{row.crashes}</td><td>{row.total_net ?? 0}</td><td>{row.avg_net ?? 0}</td><td>{row.last_run_at || "—"}</td></tr>
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
                      <tr key={row.cargo_id}><td>{row.cargo_name}</td><td>{row.runs}</td><td>{row.crashes}</td><td>{row.crash_rate_pct ?? 0}%</td><td>{row.total_net ?? 0}</td></tr>
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
                      <tr key={row.incident_id}><td>{row.incident_name}</td><td>{row.runs}</td><td>{row.crashes}</td><td>{row.crash_rate_pct ?? 0}%</td><td>{row.total_net ?? 0}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </SectionCard>

      {/* ── History ── */}
      <SectionCard title="Turf Wars & Live Ops History" icon={History} description="Recent district takeovers, gang support actions, presets, and manual economy changes.">
        {sampHistory.length === 0 ? (
          <EmptyState icon={History} title="No recent gameplay history" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Time</th><th>Category</th><th>Event</th><th>Actor</th><th>Target</th><th>Amount</th></tr></thead>
              <tbody>
                {sampHistory.map((row) => (
                  <tr key={row.id}><td>{row.ts}</td><td>{row.category}</td><td>{row.summary}</td><td>{row.actor || row.from_user || "—"}</td><td>{row.target || row.to_user || "—"}</td><td>{row.amount || 0}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Users + Ledger ── */}
      <SectionCard title="SA-MP Life Users" icon={Map}>
        {sampError && <Alert type="error">{sampError}</Alert>}
        {sampSuccess && <Alert type="success">{sampSuccess}</Alert>}
        <div className="row-actions mb-4">
          <input placeholder="User ID" value={sampUserId} onChange={(e) => setSampUserId(e.target.value)} />
          <input placeholder="Money Δ" type="number" value={sampAdjust.moneyDelta} onChange={(e) => setSampAdjust((p) => ({ ...p, moneyDelta: Number(e.target.value) }))} />
          <input placeholder="Rep Δ" type="number" value={sampAdjust.repDelta} onChange={(e) => setSampAdjust((p) => ({ ...p, repDelta: Number(e.target.value) }))} />
          <input placeholder="Jail min" type="number" value={sampAdjust.jailMinutes} onChange={(e) => setSampAdjust((p) => ({ ...p, jailMinutes: Number(e.target.value) }))} />
          <button onClick={() => adjustSampUser(sampUserId, sampAdjust)}>Apply</button>
          <button className="btn--ghost" onClick={() => inspectSampUser(sampUserId)}>Inspect</button>
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
                    <td>{r.user_id}</td><td>{r.money}</td><td>{r.rep}</td><td>{r.businesses_owned || 0}</td><td>{r.truck_net ?? 0}</td><td>{r.truck_runs ?? 0}</td><td>{r.jail_until || "—"}</td>
                    <td><button className="btn--ghost btn--sm" onClick={() => inspectSampUser(r.user_id)}>Inspect</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── User Details ── */}
      {sampUserDetails && (
        <SectionCard
          title={`SA-MP User Details: ${sampUserDetails.user?.user_id || sampUserId}`}
          icon={Map}
          description="Inventory, cooldowns, business state, and truck telemetry for the selected player."
        >
          <div className="grid grid-4 mb-4">
            <div className="card stat-card"><div className="stat-card__label">Money</div><div className="stat-card__value">{sampUserDetails.user?.money ?? 0}</div></div>
            <div className="card stat-card"><div className="stat-card__label">Rep</div><div className="stat-card__value">{sampUserDetails.user?.rep ?? 0}</div></div>
            <div className="card stat-card"><div className="stat-card__label">Businesses</div><div className="stat-card__value">{(sampUserDetails.businesses || []).length}</div></div>
            <div className="card stat-card"><div className="stat-card__label">Truck net</div><div className="stat-card__value">{sampUserDetails.truckStats?.net_total ?? 0}</div></div>
          </div>

          <div className="grid grid-4 mb-4">
            <div className="card stat-card"><div className="stat-card__label">Truck runs</div><div className="stat-card__value">{sampUserDetails.truckStats?.total_runs ?? 0}</div></div>
            <div className="card stat-card"><div className="stat-card__label">Crash rate</div><div className="stat-card__value">{sampUserDetails.truckStats?.real_crash_pct ?? 0}%</div></div>
            <div className="card stat-card"><div className="stat-card__label">Best run</div><div className="stat-card__value">{sampUserDetails.truckStats?.best_run ?? 0}</div></div>
            <div className="card stat-card"><div className="stat-card__label">Worst run</div><div className="stat-card__value">{sampUserDetails.truckStats?.worst_run ?? 0}</div></div>
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
                        <tr key={row.id}><td>{row.created_at}</td><td>{row.route_name}</td><td>{row.cargo_name}</td><td>{row.incident_name}</td><td>{row.crashed ? "Crash" : "Success"}</td><td>{row.net_amount}</td></tr>
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
                        <tr key={row.property_id}><td>{row.property_id}</td><td>{row.district_name || row.district || "—"}</td><td>{row.condition}%</td><td>{row.supplies}%</td><td>{row.total_collected}</td><td>{row.gang_boost_until || "—"}</td><td>{row.territory_gang_name ? `${row.territory_gang_name} (+${row.territory_buff_pct}%)` : "Neutral"}</td></tr>
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
                        <tr key={row.action}><td>{row.action}</td><td>{row.ready_at}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        </SectionCard>
      )}

      {/* ── Ledger ── */}
      <SectionCard title="SA-MP Ledger" icon={Map} description="Transaction history.">
        {sampLedger.length === 0 ? (
          <EmptyState icon={Map} title="No ledger entries" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>ID</th><th>Type</th><th>From</th><th>To</th><th>Amount</th><th>Time</th></tr></thead>
              <tbody>
                {sampLedger.map((row) => (
                  <tr key={row.id}><td>{row.id}</td><td>{row.type}</td><td>{row.from_user || "—"}</td><td>{row.to_user || "—"}</td><td>{row.amount}</td><td>{row.ts}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}