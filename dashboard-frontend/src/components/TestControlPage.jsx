import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertCircle, Clock3, Play, SlidersHorizontal, UserCheck, Wrench } from 'lucide-react';
import { alarmsAPI, routesAPI, rtusAPI } from '../services/api';

const FAULT_CAUSES = [
  'FIBER_BREAK',
  'SPLICE_LOSS',
  'CONNECTOR_FAILURE',
  'BENDING',
  'WATER_INGRESS',
  'CUT_CABLE',
  'VANDALISM',
  'POWER_EVENT',
  'UNKNOWN'
];

const LAST_SELECTED_RTU_STORAGE_KEY = 'fibermaster.lastSelectedRtuId';
const RTU_CONFIG_CACHE_STORAGE_KEY = 'fibermaster.rtuConfigCache';

const getStoredRtuId = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(LAST_SELECTED_RTU_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const storeRtuId = (rtuId) => {
  if (!rtuId || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(LAST_SELECTED_RTU_STORAGE_KEY, rtuId);
  } catch {
    // Ignore storage access errors.
  }
};

const normalizeOtdrMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['auto', 'automatic', 'periodic'].includes(normalized) ? 'auto' : 'manual';
};

const readRtuConfigCache = () => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(RTU_CONFIG_CACHE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const getCachedRtuConfig = (rtuId) => {
  if (!rtuId) {
    return null;
  }

  const cache = readRtuConfigCache();
  return cache[rtuId] || null;
};

const storeCachedRtuConfig = (rtuId, configPatch) => {
  if (!rtuId || !configPatch || typeof window === 'undefined') {
    return;
  }

  try {
    const cache = readRtuConfigCache();
    const existing = cache[rtuId] || {};
    cache[rtuId] = {
      ...existing,
      ...configPatch,
      mode: normalizeOtdrMode(configPatch.mode ?? existing.mode),
    };

    window.localStorage.setItem(RTU_CONFIG_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage access errors.
  }
};

const parseTimestamp = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    const millis = value < 100000000000 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'object' && typeof value.epochSecond === 'number') {
    const nanos = typeof value.nano === 'number' ? value.nano : 0;
    const millis = (value.epochSecond * 1000) + Math.floor(nanos / 1000000);
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

const formatCountdown = (targetDate) => {
  if (!targetDate) {
    return '-';
  }

  const remainingMs = targetDate.getTime() - Date.now();
  if (remainingMs <= 0) {
    return 'Resolving...';
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
};

const formatLabel = (value) => {
  if (!value || value === '-') {
    return '-';
  }

  return String(value)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

function TestControlPage({ configOnly = false }) {
  const latestConfigRequestRef = useRef(0);
  const [routes, setRoutes] = useState([]);
  const [activeAlarms, setActiveAlarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [manualTesting, setManualTesting] = useState(false);
  const [feedback, setFeedback] = useState({
    type: null,
    text: ''
  });
  const [lastManualTest, setLastManualTest] = useState(null);
  const [form, setForm] = useState(() => ({
    rtuId: getStoredRtuId(),
    routeId: '',
    faultType: 'break',
    faultCause: 'FIBER_BREAK',
    faultLocationKm: '',
    attenuationDb: '',
    repairDurationSeconds: '300',
  }));
  const [otdrConfig, setOtdrConfig] = useState({
    mode: 'manual',
    periodSeconds: 300,
    routeId: '',
    nextAutoTestAt: null
  });

  const groupedRoutes = useMemo(() => {
    const groups = new Map();
    for (const route of routes) {
      const rtuId = route.rtuId || 'UNKNOWN_RTU';
      if (!groups.has(rtuId)) {
        groups.set(rtuId, []);
      }
      groups.get(rtuId).push(route);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [routes]);

  const selectedRtuRoutes = useMemo(
    () => routes.filter((route) => route.rtuId === form.rtuId),
    [routes, form.rtuId]
  );

  const loadOtdrConfig = async (rtuId, defaultRouteId = '') => {
    if (!rtuId) {
      setOtdrConfig({
        mode: 'manual',
        periodSeconds: 300,
        routeId: defaultRouteId,
        nextAutoTestAt: null
      });
      return;
    }

    const requestId = ++latestConfigRequestRef.current;

    try {
      const response = await rtusAPI.getOtdrConfig(rtuId);
      const payload = response.data || {};
      const mode = normalizeOtdrMode(payload.mode);
      const nextAutoTestAt = payload.next_auto_test_at || null;

      if (requestId !== latestConfigRequestRef.current) {
        return;
      }

      setOtdrConfig((prev) => ({
        ...prev,
        mode,
        periodSeconds: payload.period_seconds || prev.periodSeconds || 300,
        routeId: defaultRouteId || prev.routeId || '',
        nextAutoTestAt
      }));

      storeCachedRtuConfig(rtuId, {
        mode,
        periodSeconds: payload.period_seconds || 300,
        routeId: defaultRouteId || '',
        nextAutoTestAt,
      });
    } catch (error) {
      console.error(`Failed to load OTDR config for ${rtuId}:`, error);
      const cached = getCachedRtuConfig(rtuId);

      if (requestId !== latestConfigRequestRef.current) {
        return;
      }

      setOtdrConfig((prev) => ({
        ...prev,
        mode: normalizeOtdrMode(cached?.mode || prev.mode),
        periodSeconds: cached?.periodSeconds || prev.periodSeconds || 300,
        routeId: defaultRouteId || cached?.routeId || prev.routeId || '',
        nextAutoTestAt: cached?.nextAutoTestAt || prev.nextAutoTestAt || null
      }));
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [routesResponse, alarmsResponse] = await Promise.all([
        routesAPI.getAll(),
        alarmsAPI.getActive()
      ]);

      const allRoutes = Array.isArray(routesResponse.data)
        ? routesResponse.data
        : routesResponse.data.value || [];

      const alarms = Array.isArray(alarmsResponse.data) ? alarmsResponse.data : [];

      setRoutes(allRoutes);
      setActiveAlarms(alarms);

      if (allRoutes.length > 0) {
        const preferredRtuId = form.rtuId || getStoredRtuId();
        let selectedRtu = preferredRtuId || allRoutes[0].rtuId;
        let routesForRtu = allRoutes.filter((route) => route.rtuId === selectedRtu);

        if (routesForRtu.length === 0) {
          selectedRtu = allRoutes[0].rtuId;
          routesForRtu = allRoutes.filter((route) => route.rtuId === selectedRtu);
        }

        storeRtuId(selectedRtu);
        const cachedConfig = getCachedRtuConfig(selectedRtu);
        const cachedRouteStillExists = cachedConfig?.routeId
          ? allRoutes.some((route) => route.routeId === cachedConfig.routeId && route.rtuId === selectedRtu)
          : false;

        const selectedRouteStillExists = allRoutes.some(
          (route) => route.routeId === form.routeId && route.rtuId === selectedRtu
        );
        const defaultRouteId = selectedRouteStillExists
          ? form.routeId
          : (cachedRouteStillExists
            ? cachedConfig.routeId
            : (routesForRtu[0]?.routeId || allRoutes[0]?.routeId || ''));

        setForm((prev) => ({
          ...prev,
          rtuId: selectedRtu,
          routeId: defaultRouteId
        }));

        setOtdrConfig((prev) => ({
          ...prev,
          mode: normalizeOtdrMode(cachedConfig?.mode || prev.mode),
          periodSeconds: cachedConfig?.periodSeconds || prev.periodSeconds,
          routeId: cachedConfig?.routeId || defaultRouteId,
          nextAutoTestAt: cachedConfig?.nextAutoTestAt || prev.nextAutoTestAt
        }));

        await loadOtdrConfig(selectedRtu, defaultRouteId);
      }
    } catch (error) {
      console.error('Failed to load test control data:', error);
      setFeedback((prev) => ({
        ...prev,
        type: 'error',
        text: 'Unable to load routes or active alarms.'
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleConfigChange = (field, value) => {
    setOtdrConfig((prev) => ({ ...prev, [field]: value }));

    if (field === 'routeId' && form.rtuId) {
      storeCachedRtuConfig(form.rtuId, { routeId: value });
    }
  };

  const handleRtuChange = async (value) => {
    storeRtuId(value);
    const cachedConfig = getCachedRtuConfig(value);

    const routeCandidates = routes.filter((route) => route.rtuId === value);
    const hasCachedRoute = cachedConfig?.routeId
      ? routeCandidates.some((route) => route.routeId === cachedConfig.routeId)
      : false;
    const routeId = hasCachedRoute ? cachedConfig.routeId : (routeCandidates[0]?.routeId || '');

    setForm((prev) => ({
      ...prev,
      rtuId: value,
      routeId
    }));

    setOtdrConfig((prev) => ({
      ...prev,
      mode: normalizeOtdrMode(cachedConfig?.mode || prev.mode),
      periodSeconds: cachedConfig?.periodSeconds || prev.periodSeconds,
      routeId
    }));

    await loadOtdrConfig(value, routeId);
  };

  const handleSaveOtdrConfig = async () => {
    if (!form.rtuId) {
      setFeedback({
        type: 'error',
        text: 'Select an RTU before saving OTDR configuration.'
      });
      return;
    }

    const periodSeconds = Number(otdrConfig.periodSeconds);
    if (!Number.isFinite(periodSeconds) || periodSeconds < 30) {
      setFeedback({
        type: 'error',
        text: 'OTDR period must be a number >= 30 seconds.'
      });
      return;
    }

    setConfigSaving(true);
    try {
      const response = await rtusAPI.updateOtdrConfig(form.rtuId, {
        mode: otdrConfig.mode,
        periodSeconds
      });
      const payload = response.data || {};

      setOtdrConfig((prev) => {
        const mode = normalizeOtdrMode(payload.mode);
        const period = payload.period_seconds || periodSeconds;
        const nextAutoTestAt = payload.next_auto_test_at || null;

        storeCachedRtuConfig(form.rtuId, {
          mode,
          periodSeconds: period,
          routeId: prev.routeId || form.routeId || '',
          nextAutoTestAt,
        });

        return {
          ...prev,
          mode,
          periodSeconds: period,
          nextAutoTestAt
        };
      });

      setFeedback({
        type: 'success',
        text: `OTDR configuration saved: mode ${payload.mode || otdrConfig.mode}, period ${payload.period_seconds || periodSeconds}s.`
      });
    } catch (error) {
      console.error('Failed to update OTDR config:', error);
      setFeedback({
        type: 'error',
        text: 'Failed to save OTDR configuration.'
      });
    } finally {
      setConfigSaving(false);
    }
  };

  const handleLaunchManualTest = async () => {
    if (!form.rtuId) {
      setFeedback({
        type: 'error',
        text: 'Select an RTU before launching a manual test.'
      });
      return;
    }

    const routeId = otdrConfig.routeId || form.routeId;
    if (!routeId) {
      setFeedback({
        type: 'error',
        text: 'Select a route for the manual test.'
      });
      return;
    }

    setManualTesting(true);
    try {
      const response = await rtusAPI.launchManualTest(form.rtuId, routeId);
      const result = response.data || {};
      setLastManualTest(result);

      const variationText = typeof result.power_variation_db === 'number'
        ? `${result.power_variation_db.toFixed(3)} dB`
        : '-';

      setFeedback({
        type: 'success',
        text: `Manual test completed on ${routeId}. Files: ${result.event_reference_file || 'N/A'} + ${result.measurement_reference_file || 'N/A'} | power variation: ${variationText}`
      });

      await loadData();
    } catch (error) {
      console.error('Failed to launch manual test:', error);
      setFeedback({
        type: 'error',
        text: 'Failed to launch manual OTDR test.'
      });
    } finally {
      setManualTesting(false);
    }
  };

  const handleCreateManualAlarm = async () => {
    if (!form.rtuId || !form.routeId) {
      setFeedback({
        type: 'error',
        text: 'Select an RTU and a route before creating an alarm.'
      });
      return;
    }

    const repairDurationSeconds = Number(form.repairDurationSeconds);
    const attenuationDb = Number(form.attenuationDb);
    const faultLocationKm = Number(form.faultLocationKm);

    if (!Number.isFinite(repairDurationSeconds) || repairDurationSeconds <= 0) {
      setFeedback({
        type: 'error',
        text: 'Repair duration must be a strictly positive number (seconds).'
      });
      return;
    }

    if (!Number.isFinite(attenuationDb) || attenuationDb <= 0) {
      setFeedback({
        type: 'error',
        text: 'Attenuation value must be a strictly positive number.'
      });
      return;
    }

    if (!Number.isFinite(faultLocationKm) || faultLocationKm < 0) {
      setFeedback({
        type: 'error',
        text: 'Location (km) must be a valid number >= 0.'
      });
      return;
    }

    setSubmitting(true);
    setFeedback({ type: null, text: '' });

    try {
      await alarmsAPI.createManual({
        rtuId: form.rtuId,
        routeId: form.routeId,
        faultType: form.faultType,
        faultCause: form.faultCause,
        faultLocationDescription: '',
        faultLocationKm,
        attenuationDb,
        description: '',
        assignToTechnician: true,
        technicianName: 'field-team',
        repairDurationSeconds
      });

      let faultSyncFailed = false;
      try {
        await rtusAPI.injectRouteFault(form.rtuId, form.routeId, {
          faultType: form.faultType,
          repairDurationSeconds,
          attenuationDb,
          generateAlarm: false,
          sendTestReport: false
        });
      } catch (faultError) {
        faultSyncFailed = true;
        console.error('Manual alarm created but RTU fault sync failed:', faultError);
      }

      await loadData();

      if (faultSyncFailed) {
        setFeedback({
          type: 'error',
          text: `Manual alarm created for ${form.routeId}, but RTU fault synchronization failed.`
        });
      } else {
        setFeedback({
          type: 'success',
          text: `Manual alarm created for ${form.routeId}. Power drop and variation now follow your attenuation (${attenuationDb.toFixed(2)} dB). Auto-recovery countdown starts after alarm acknowledgment and lasts ${repairDurationSeconds}s.`
        });
      }
    } catch (error) {
      console.error('Failed to create manual alarm:', error);
      setFeedback({
        type: 'error',
        text: 'Failed to create manual alarm.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const nextAutoTestDate = parseTimestamp(otdrConfig.nextAutoTestAt);

  return (
    <div className="space-y-6">
      {configOnly ? (
        <div className="card bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-900 text-white shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <SlidersHorizontal className="w-6 h-6" />
              Test Configuration
            </h2>
            <p className="text-sm text-slate-100">Configure OTDR mode, schedule, and manual route tests.</p>
          </div>
        </div>
      ) : (
        <div className="card bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-900 text-white shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Wrench className="w-6 h-6" />
                Manual Maintenance Test Interface
              </h2>
            </div>
          </div>
        </div>
      )}

      {feedback?.type && (
        <div className={`card border ${feedback.type === 'success' ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>
          <p className={`text-sm font-medium ${feedback.type === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
            {feedback.text}
          </p>
        </div>
      )}

      {loading ? (
        <div className="card">
          <p className="text-sm text-slate-600 flex items-center gap-2">
            <Activity className="w-4 h-4 animate-spin" /> Loading routes...
          </p>
        </div>
      ) : (
        <>
          {configOnly && (
            <div className="card space-y-5 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-blue-700" />
                  OTDR Parameters
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm font-medium text-slate-700 space-y-1">
                  <span>RTU</span>
                  <select
                    value={form.rtuId}
                    onChange={(e) => handleRtuChange(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    {groupedRoutes.map(([rtuId]) => (
                      <option key={rtuId} value={rtuId}>{rtuId}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700 space-y-1">
                  <span>Mode OTDR</span>
                  <select
                    value={otdrConfig.mode}
                    onChange={(e) => handleConfigChange('mode', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="manual">Manual</option>
                    <option value="auto">Auto</option>
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700 space-y-1">
                  <span>Auto test period (seconds)</span>
                  <input
                    type="number"
                    min="30"
                    step="1"
                    value={otdrConfig.periodSeconds}
                    onChange={(e) => handleConfigChange('periodSeconds', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700 space-y-1">
                  <span>Manual test route</span>
                  <select
                    value={otdrConfig.routeId || form.routeId}
                    onChange={(e) => handleConfigChange('routeId', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    {selectedRtuRoutes.map((route) => (
                      <option key={route.routeId} value={route.routeId}>{route.routeId}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleSaveOtdrConfig}
                  disabled={configSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-white font-semibold shadow-sm hover:bg-blue-800 disabled:opacity-50"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  {configSaving ? 'Saving...' : 'Save Config'}
                </button>

                <button
                  onClick={handleLaunchManualTest}
                  disabled={manualTesting}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  {manualTesting ? 'Test running...' : 'Launch Manual Test'}
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-medium text-slate-600">
                  Next auto test: {nextAutoTestDate ? nextAutoTestDate.toLocaleString() : '-'}
                </span>
              </div>

              {lastManualTest && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <p className="font-semibold">Last manual test: {lastManualTest.route_id || '-'}</p>
                  <p>
                    Reference files: {lastManualTest.event_reference_file || '-'} + {lastManualTest.measurement_reference_file || '-'}
                  </p>
                  <p>
                    Average power: {typeof lastManualTest.average_power_db === 'number' ? `${lastManualTest.average_power_db.toFixed(3)} dB` : '-'}
                    {' | '}
                    Variation: {typeof lastManualTest.power_variation_db === 'number' ? `${lastManualTest.power_variation_db.toFixed(3)} dB` : '-'}
                  </p>
                </div>
              )}
            </div>
          )}

          {!configOnly && (
            <>
              <div className="card space-y-5 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-blue-700" />
                    Manual Alarm Creation
                  </h3>
                </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <label className="text-sm font-medium text-slate-700 space-y-1 md:col-span-3">
                <span>RTU</span>
                <select
                  value={form.rtuId}
                  onChange={(e) => handleRtuChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {groupedRoutes.map(([rtuId]) => (
                    <option key={rtuId} value={rtuId}>{rtuId}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1 md:col-span-3">
                <span>Route</span>
                <select
                  value={form.routeId}
                  onChange={(e) => handleChange('routeId', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {selectedRtuRoutes.map((route) => (
                    <option key={route.routeId} value={route.routeId}>{route.routeId}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1 md:col-span-3">
                <span>Alarm type</span>
                <select
                  value={form.faultType}
                  onChange={(e) => handleChange('faultType', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="break">Fiber Break</option>
                  <option value="degradation">Degradation</option>
                  <option value="high_loss_splice">High Event Loss</option>
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1 md:col-span-3">
                <span>Fault cause</span>
                <select
                  value={form.faultCause}
                  onChange={(e) => handleChange('faultCause', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {FAULT_CAUSES.map((cause) => (
                    <option key={cause} value={cause}>{formatLabel(cause)}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1 md:col-span-2">
                <span>Location (km)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.faultLocationKm}
                  onChange={(e) => handleChange('faultLocationKm', e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1 md:col-span-2">
                <span>Attenuation (dB)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.attenuationDb}
                  onChange={(e) => handleChange('attenuationDb', e.target.value)}
                  placeholder="10.50"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1 md:col-span-2">
                <span>Repair duration (seconds)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.repairDurationSeconds}
                  onChange={(e) => handleChange('repairDurationSeconds', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>
            </div>

                <button
                  onClick={handleCreateManualAlarm}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-white font-semibold shadow-sm hover:bg-red-700 disabled:opacity-50"
                >
                  <UserCheck className="w-4 h-4" />
                  {submitting
                    ? 'Creating alarm...'
                    : 'Create Alarm'}
                </button>
              </div>

              <div className="card shadow-lg">
                <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    Active Alarms Under Repair
                  </h3>
                  <span className="text-xs font-medium text-slate-500">Live list</span>
                </div>

            {activeAlarms.length === 0 ? (
              <p className="text-sm text-slate-600">No active alarm.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="pb-2 pr-4">RTU</th>
                      <th className="pb-2 pr-4">Route</th>
                      <th className="pb-2 pr-4">Cause</th>
                      <th className="pb-2 pr-4">Start</th>
                      <th className="pb-2 pr-4">Expected end</th>
                      <th className="pb-2">Countdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeAlarms.map((alarm) => {
                      const lifecycle = alarm.lifecycle || {};
                      const start = parseTimestamp(lifecycle.createdAt || lifecycle.created_at);
                      const end = parseTimestamp(lifecycle.autoResolveAt || lifecycle.auto_resolve_at);
                      const cause = alarm.details?.faultCause || alarm.details?.fault_cause || alarm.details?.eventType || '-';

                      return (
                        <tr key={alarm.alarmId || alarm.alarm_id || alarm.id} className="border-b border-slate-100">
                          <td className="py-2 pr-4 text-slate-700">{alarm.rtuId || alarm.rtu_id || '-'}</td>
                          <td className="py-2 pr-4 font-semibold text-slate-800">{alarm.routeId || alarm.route_id || '-'}</td>
                          <td className="py-2 pr-4 text-slate-700">{formatLabel(cause)}</td>
                          <td className="py-2 pr-4 text-slate-600">{start ? start.toLocaleString() : '-'}</td>
                          <td className="py-2 pr-4 text-slate-600">{end ? end.toLocaleString() : '-'}</td>
                          <td className="py-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                              <Clock3 className="w-3 h-3" /> {formatCountdown(end)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default TestControlPage;
