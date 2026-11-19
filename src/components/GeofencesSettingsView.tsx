import React, { useState } from 'react';
import {
  Laptop,
  MapPin,
  Plus,
  RotateCcw,
  Server,
  Shield,
  Smartphone,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { ServerConfig } from '../services/api';
import { AppSettings, ClockInPolicyMode, Employee, GeofenceZone, UserRole } from '../types/hr';
import { validateApiBaseUrl } from '../utils/hrLogic';
import { GeofenceMap } from './GeofenceMap';

interface GeofencesSettingsViewProps {
  activeRole: UserRole;
  geofences: GeofenceZone[];
  employees: Employee[];
  settings: AppSettings;
  serverConfig: ServerConfig;
  onUpdateServerConfig: (config: ServerConfig) => void;
  onSimulateOffline: () => void;
  onCreateZone: (zone: Omit<GeofenceZone, 'id'>) => Promise<void>;
  onUpdateZone: (id: string, patch: Partial<GeofenceZone>) => Promise<void>;
  onDeleteZone: (id: string) => Promise<void>;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onUpdateEmployeePolicy: (
    employeeId: string,
    policy: ClockInPolicyMode | 'inherit'
  ) => Promise<void>;
  onResetDemoData: () => Promise<void>;
}

export const GeofencesSettingsView: React.FC<GeofencesSettingsViewProps> = ({
  activeRole,
  geofences,
  employees,
  settings,
  serverConfig,
  onUpdateServerConfig,
  onSimulateOffline,
  onCreateZone,
  onUpdateZone,
  onDeleteZone,
  onUpdateSettings,
  onUpdateEmployeePolicy,
  onResetDemoData,
}) => {
  const canEdit = activeRole === UserRole.Admin || activeRole === UserRole.Management;
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(geofences[0]?.id ?? null);
  const [draftName, setDraftName] = useState('');
  const [draftAddress, setDraftAddress] = useState('');
  const [draftLat, setDraftLat] = useState(25.2048);
  const [draftLng, setDraftLng] = useState(55.2708);
  const [draftRadius, setDraftRadius] = useState(150);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [hasDroppedPin, setHasDroppedPin] = useState(false);

  const [serverUrlDraft, setServerUrlDraft] = useState(serverConfig.apiBaseUrl);
  const [serverUrlFeedback, setServerUrlFeedback] = useState<string | null>(null);

  const handleMapClick = (lat: number, lng: number) => {
    if (!canEdit) return;
    setDraftLat(lat);
    setDraftLng(lng);
    setHasDroppedPin(true);
    setSelectedZoneId(null);
  };

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftName.trim()) {
      setZoneError('Enter a location name (e.g. Warehouse — Al Quoz).');
      return;
    }
    setZoneError(null);
    await onCreateZone({
      name: draftName.trim(),
      address: draftAddress.trim() || `${draftLat.toFixed(4)}, ${draftLng.toFixed(4)}`,
      latitude: draftLat,
      longitude: draftLng,
      radiusMeters: draftRadius,
      active: true,
    });
    setDraftName('');
    setDraftAddress('');
    setHasDroppedPin(false);
  };

  const handleSaveServerUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateApiBaseUrl(serverUrlDraft);
    if (!check.valid) {
      setServerUrlFeedback(check.error);
      return;
    }
    onUpdateServerConfig({
      ...serverConfig,
      apiBaseUrl: check.normalized,
    });
    setServerUrlDraft(check.normalized);
    setServerUrlFeedback('Self-hosted backend URL updated.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          Geofenced Locations, Clock-In Policy & Server
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Pin approved work zones on OpenStreetMap, configure allowed radii, control PC vs. Mobile
          clock-in rules, and point the app to your self-hosted backend.
        </p>
      </div>

      {/* Interactive Map + Zone Creator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Interactive Geofence Map
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              OpenStreetMap / Leaflet
            </span>
          </div>
          <div className="flex-1 min-h-[340px]">
            <GeofenceMap
              zones={geofences}
              selectedZoneId={selectedZoneId}
              interactivePinDrop={canEdit}
              onMapClick={handleMapClick}
              draftPin={
                hasDroppedPin || draftName.trim().length > 0
                  ? {
                      latitude: draftLat,
                      longitude: draftLng,
                      radiusMeters: draftRadius,
                      name: draftName || 'New Geofence Zone',
                    }
                  : null
              }
              heightClass="h-full min-h-[340px]"
            />
          </div>
        </section>

        {/* Create New Zone Form */}
        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <form onSubmit={handleCreateZone} className="space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Create Geofence Zone
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click anywhere on the map to drop a pin, or enter exact coordinates below.
            </p>

            {zoneError && (
              <p
                role="alert"
                className="text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2"
              >
                {zoneError}
              </p>
            )}

            <div>
              <label
                htmlFor="zone-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Location Name
              </label>
              <input
                id="zone-name"
                type="text"
                disabled={!canEdit}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="e.g. Warehouse — Al Quoz"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>

            <div>
              <label
                htmlFor="zone-addr"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Street / Building Address
              </label>
              <input
                id="zone-addr"
                type="text"
                disabled={!canEdit}
                value={draftAddress}
                onChange={(e) => setDraftAddress(e.target.value)}
                placeholder="e.g. Street 14, Al Quoz Industrial, Dubai"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="zone-lat"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Latitude
                </label>
                <input
                  id="zone-lat"
                  type="number"
                  step="0.000001"
                  disabled={!canEdit}
                  value={draftLat}
                  onChange={(e) => {
                    setDraftLat(Number(e.target.value));
                    setHasDroppedPin(true);
                  }}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="zone-lng"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Longitude
                </label>
                <input
                  id="zone-lng"
                  type="number"
                  step="0.000001"
                  disabled={!canEdit}
                  value={draftLng}
                  onChange={(e) => {
                    setDraftLng(Number(e.target.value));
                    setHasDroppedPin(true);
                  }}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-lg"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="zone-radius"
                  className="text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Allowed Radius
                </label>
                <span className="text-xs font-mono font-semibold text-indigo-700 dark:text-indigo-400 tabular-nums">
                  {draftRadius}m
                </span>
              </div>
              <input
                id="zone-radius"
                type="range"
                min={50}
                max={500}
                step={10}
                disabled={!canEdit}
                value={draftRadius}
                onChange={(e) => {
                  setDraftRadius(Number(e.target.value));
                  setHasDroppedPin(true);
                }}
                className="w-full accent-indigo-700"
              />
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>50m</span>
                <span>250m</span>
                <span>500m</span>
              </div>
            </div>

            {canEdit && (
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-700 text-white text-sm font-medium hover:bg-indigo-800 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Save Geofence Location
              </button>
            )}
          </form>
        </section>
      </div>

      {/* Existing Zones List */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Configured Work Locations
          </h3>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {geofences.map((zone) => {
            const assignedCount = employees.filter((e) =>
              e.assignedZoneIds.includes(zone.id)
            ).length;
            const isSelected = selectedZoneId === zone.id;
            return (
              <div
                key={zone.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  isSelected
                    ? 'bg-indigo-50/40 dark:bg-indigo-950/30'
                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedZoneId(zone.id)}
                  className="text-left flex-1 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {zone.name}
                    </span>
                    <span className="text-xs font-mono text-indigo-700 dark:text-indigo-400 font-medium">
                      {zone.radiusMeters}m radius
                    </span>
                    {!zone.active && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">(Paused)</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {zone.address} &middot;{' '}
                    <span className="font-mono">
                      {zone.latitude.toFixed(5)}, {zone.longitude.toFixed(5)}
                    </span>{' '}
                    &middot; {assignedCount} assigned staff
                  </p>
                </button>

                {canEdit && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onUpdateZone(zone.id, { active: !zone.active })}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {zone.active ? 'Pause' : 'Activate'}
                    </button>
                    {geofences.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteZone(zone.id)}
                        aria-label={`Delete ${zone.name}`}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* PC vs. Mobile Clock-In Policy Panel */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              PC vs. Mobile Clock-In Policy
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Control whether employees can punch in from PC browsers or must use verified mobile
              hardware GPS (&le; {settings.maxMobileAccuracyMeters}m accuracy).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() =>
              onUpdateSettings({ globalClockInPolicy: ClockInPolicyMode.StrictMobileGPS })
            }
            className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
              settings.globalClockInPolicy === ClockInPolicyMode.StrictMobileGPS
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Smartphone className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
                Strict Mobile GPS Only
              </span>
              {settings.globalClockInPolicy === ClockInPolicyMode.StrictMobileGPS && (
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                  Active Global Policy
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
              Blocks clock-ins from PC Web and rejects low-accuracy IP geolocation (&gt; 150m
              radius). Ideal for field crews and strict site verification.
            </p>
          </button>

          <button
            type="button"
            disabled={!canEdit}
            onClick={() =>
              onUpdateSettings({ globalClockInPolicy: ClockInPolicyMode.AllowOfficePC })
            }
            className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
              settings.globalClockInPolicy === ClockInPolicyMode.AllowOfficePC
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <Laptop className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
                Allow Office Network / PC Clock-In
              </span>
              {settings.globalClockInPolicy === ClockInPolicyMode.AllowOfficePC && (
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                  Active Global Policy
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
              Permits PC browser clock-in inside assigned geofences while tagging every log as{' '}
              <strong>PC Web</strong> vs <strong>Mobile App</strong> for HR auditing.
            </p>
          </button>
        </div>

        {/* Per-Employee Policy Overrides */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Per-Employee Policy Overrides
          </h4>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white dark:bg-slate-950"
              >
                <div className="text-sm">
                  <span className="font-medium text-slate-900 dark:text-white">{emp.fullName}</span>{' '}
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    &middot; {emp.department}
                  </span>
                </div>
                <select
                  disabled={!canEdit}
                  aria-label={`Clock-in policy for ${emp.fullName}`}
                  value={emp.clockInPolicyOverride ?? 'inherit'}
                  onChange={(e) =>
                    onUpdateEmployeePolicy(
                      emp.id,
                      e.target.value as ClockInPolicyMode | 'inherit'
                    )
                  }
                  className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                >
                  <option value="inherit">Inherit Global Policy</option>
                  <option value={ClockInPolicyMode.StrictMobileGPS}>Strict Mobile GPS Only</option>
                  <option value={ClockInPolicyMode.AllowOfficePC}>Allow Office Network / PC</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Self-Hosted PC / Ubuntu Backend Configuration */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Self-Hosted Server & API Mode
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Point this client at your self-hosted Ubuntu / PC REST API (JWT Bearer) or run in
                local Demo Mode.
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 self-start shrink-0">
            <button
              type="button"
              onClick={() => onUpdateServerConfig({ ...serverConfig, useMockApi: true })}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                serverConfig.useMockApi
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Demo / Local Mode
            </button>
            <button
              type="button"
              onClick={() => onUpdateServerConfig({ ...serverConfig, useMockApi: false })}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                !serverConfig.useMockApi
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Self-Hosted REST API
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveServerUrl} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="url"
            value={serverUrlDraft}
            onChange={(e) => {
              setServerUrlDraft(e.target.value);
              setServerUrlFeedback(null);
            }}
            aria-label="Self-hosted API Base URL"
            placeholder="http://192.168.1.50:8000/api/v1"
            className="flex-1 px-3 py-2 text-sm font-mono border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-lg"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-indigo-700 text-white text-xs font-semibold hover:bg-indigo-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            Save Server URL
          </button>
        </form>
        {serverUrlFeedback && (
          <p className="text-xs text-indigo-700 dark:text-indigo-400">{serverUrlFeedback}</p>
        )}

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSimulateOffline}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            <WifiOff className="w-3.5 h-3.5" />
            Preview Offline Screen
          </button>

          <button
            type="button"
            onClick={onResetDemoData}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Sample Data
          </button>
        </div>
      </section>
    </div>
  );
};
