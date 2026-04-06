import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, Clock3, Play, RefreshCw, SlidersHorizontal, UserCheck, Wrench } from 'lucide-react';
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

function TestControlPage() {
  const navigate = useNavigate();
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
  const [form, setForm] = useState({
    rtuId: '',
    routeId: '',
    faultType: 'break',
    faultCause: 'FIBER_BREAK',
    faultLocationDescription: '',
    faultLocationKm: '',
    attenuationDb: '',
    repairDurationSeconds: '300',
    technicianName: 'field-team',
    description: ''
  });
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

    try {
      const response = await rtusAPI.getOtdrConfig(rtuId);
      const payload = response.data || {};

      setOtdrConfig((prev) => ({
        ...prev,
        mode: payload.mode === 'auto' ? 'auto' : 'manual',
        periodSeconds: payload.period_seconds || prev.periodSeconds || 300,
        routeId: prev.routeId || defaultRouteId,
        nextAutoTestAt: payload.next_auto_test_at || null
      }));
    } catch (error) {
      console.error(`Failed to load OTDR config for ${rtuId}:`, error);
      setOtdrConfig((prev) => ({
        ...prev,
        mode: 'manual',
        periodSeconds: prev.periodSeconds || 300,
        routeId: prev.routeId || defaultRouteId,
        nextAutoTestAt: null
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
        let selectedRtu = form.rtuId || allRoutes[0].rtuId;
        let routesForRtu = allRoutes.filter((route) => route.rtuId === selectedRtu);

        if (routesForRtu.length === 0) {
          selectedRtu = allRoutes[0].rtuId;
          routesForRtu = allRoutes.filter((route) => route.rtuId === selectedRtu);
        }

        const selectedRouteStillExists = allRoutes.some(
          (route) => route.routeId === form.routeId && route.rtuId === selectedRtu
        );
        const defaultRouteId = selectedRouteStillExists
          ? form.routeId
          : (routesForRtu[0]?.routeId || allRoutes[0]?.routeId || '');

        setForm((prev) => ({
          ...prev,
          rtuId: selectedRtu,
          routeId: defaultRouteId
        }));

        setOtdrConfig((prev) => ({
          ...prev,
          routeId: prev.routeId || defaultRouteId
        }));

        await loadOtdrConfig(selectedRtu, defaultRouteId);
      }
    } catch (error) {
      console.error('Failed to load test control data:', error);
      setFeedback((prev) => ({
        ...prev,
        type: 'error',
        text: 'Impossible de charger les routes ou les alarmes actives.'
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
  };

  const handleRtuChange = async (value) => {
    const firstRoute = routes.find((route) => route.rtuId === value);
    const routeId = firstRoute?.routeId || '';

    setForm((prev) => ({
      ...prev,
      rtuId: value,
      routeId
    }));

    setOtdrConfig((prev) => ({
      ...prev,
      routeId
    }));

    await loadOtdrConfig(value, routeId);
  };

  const handleSaveOtdrConfig = async () => {
    if (!form.rtuId) {
      setFeedback({
        type: 'error',
        text: 'Selectionnez un RTU avant de sauvegarder la configuration OTDR.'
      });
      return;
    }

    const periodSeconds = Number(otdrConfig.periodSeconds);
    if (!Number.isFinite(periodSeconds) || periodSeconds < 30) {
      setFeedback({
        type: 'error',
        text: 'La periode OTDR doit etre un nombre >= 30 secondes.'
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

      setOtdrConfig((prev) => ({
        ...prev,
        mode: payload.mode === 'auto' ? 'auto' : 'manual',
        periodSeconds: payload.period_seconds || periodSeconds,
        nextAutoTestAt: payload.next_auto_test_at || null
      }));

      setFeedback({
        type: 'success',
        text: `Configuration OTDR enregistree: mode ${payload.mode || otdrConfig.mode}, periode ${payload.period_seconds || periodSeconds}s.`
      });
    } catch (error) {
      console.error('Failed to update OTDR config:', error);
      setFeedback({
        type: 'error',
        text: 'Echec de sauvegarde de la configuration OTDR.'
      });
    } finally {
      setConfigSaving(false);
    }
  };

  const handleLaunchManualTest = async () => {
    if (!form.rtuId) {
      setFeedback({
        type: 'error',
        text: 'Selectionnez un RTU avant de lancer un test manuel.'
      });
      return;
    }

    const routeId = otdrConfig.routeId || form.routeId;
    if (!routeId) {
      setFeedback({
        type: 'error',
        text: 'Selectionnez une route pour le test manuel.'
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
        text: `Test manuel termine sur ${routeId}. Fichiers: ${result.event_reference_file || 'N/A'} + ${result.measurement_reference_file || 'N/A'} | variation puissance: ${variationText}`
      });

      await loadData();
    } catch (error) {
      console.error('Failed to launch manual test:', error);
      setFeedback({
        type: 'error',
        text: 'Echec du lancement du test OTDR manuel.'
      });
    } finally {
      setManualTesting(false);
    }
  };

  const handleCreateManualAlarm = async () => {
    if (!form.rtuId || !form.routeId) {
      setFeedback({
        type: 'error',
        text: 'Selectionnez un RTU et une route avant de creer une alarme.'
      });
      return;
    }

    const repairDurationSeconds = Number(form.repairDurationSeconds);
    const attenuationDb = Number(form.attenuationDb);
    const faultLocationKm = Number(form.faultLocationKm);

    if (!Number.isFinite(repairDurationSeconds) || repairDurationSeconds <= 0) {
      setFeedback({
        type: 'error',
        text: 'La duree de reparation doit etre un nombre strictement positif (secondes).'
      });
      return;
    }

    if (!Number.isFinite(attenuationDb) || attenuationDb <= 0) {
      setFeedback({
        type: 'error',
        text: 'La valeur d attenuation doit etre un nombre strictement positif.'
      });
      return;
    }

    if (!Number.isFinite(faultLocationKm) || faultLocationKm < 0) {
      setFeedback({
        type: 'error',
        text: 'La localisation (km) doit etre un nombre valide >= 0.'
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
        faultLocationDescription: form.faultLocationDescription,
        faultLocationKm,
        attenuationDb,
        description: form.description,
        assignToTechnician: true,
        technicianName: form.technicianName,
        repairDurationSeconds
      });

      await loadData();

      setFeedback({
        type: 'success',
        text: `Alarme manuelle creee pour ${form.routeId}. Elle sera resolue automatiquement apres ${repairDurationSeconds}s.`
      });
    } catch (error) {
      console.error('Failed to create manual alarm:', error);
      setFeedback({
        type: 'error',
        text: 'Echec de creation de l alarme manuelle.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const activeRouteSet = new Set(
    activeAlarms
      .map((alarm) => alarm.routeId || alarm.route_id)
      .filter((routeId) => typeof routeId === 'string' && routeId.length > 0)
  );

  const nextAutoTestDate = parseTimestamp(otdrConfig.nextAutoTestAt);

  return (
    <div className="space-y-6">
      <div className="card bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-900 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Wrench className="w-6 h-6" />
              Interface Test Maintenance Manuelle
            </h2>
            <p className="mt-2 text-sm text-blue-100">
              Aucune alarme automatique: creation manuelle, assignation technicien, resolution temporisee exacte.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
            >
              Retour Dashboard
            </button>
            <button
              onClick={loadData}
              className="px-4 py-2 rounded-lg bg-white text-slate-900 font-semibold hover:bg-slate-100 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Rafraichir
            </button>
          </div>
        </div>
      </div>

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
            <Activity className="w-4 h-4 animate-spin" /> Chargement des routes...
          </p>
        </div>
      ) : (
        <>
          <div className="card space-y-4 border border-blue-200 bg-blue-50/40">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-blue-700" />
              Config OTDR
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm font-medium text-slate-700 space-y-1">
                <span>RTU</span>
                <select
                  value={form.rtuId}
                  onChange={(e) => handleRtuChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="manual">Manuel</option>
                  <option value="auto">Auto</option>
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1">
                <span>Periode test auto (secondes)</span>
                <input
                  type="number"
                  min="30"
                  step="1"
                  value={otdrConfig.periodSeconds}
                  onChange={(e) => handleConfigChange('periodSeconds', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1">
                <span>Route test manuel</span>
                <select
                  value={otdrConfig.routeId || form.routeId}
                  onChange={(e) => handleConfigChange('routeId', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
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
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-white font-semibold hover:bg-blue-800 disabled:opacity-50"
              >
                <SlidersHorizontal className="w-4 h-4" />
                {configSaving ? 'Sauvegarde...' : 'Sauvegarder Config'}
              </button>

              <button
                onClick={handleLaunchManualTest}
                disabled={manualTesting}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                {manualTesting ? 'Test en cours...' : 'Lancer Test Manuel'}
              </button>

              <span className="text-xs text-slate-600">
                Prochain test auto: {nextAutoTestDate ? nextAutoTestDate.toLocaleString() : '-'}
              </span>
            </div>

            {lastManualTest && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <p className="font-semibold">Dernier test manuel: {lastManualTest.route_id || '-'}</p>
                <p>
                  Fichiers reference: {lastManualTest.event_reference_file || '-'} + {lastManualTest.measurement_reference_file || '-'}
                </p>
                <p>
                  Puissance moyenne: {typeof lastManualTest.average_power_db === 'number' ? `${lastManualTest.average_power_db.toFixed(3)} dB` : '-'}
                  {' | '}
                  Variation: {typeof lastManualTest.power_variation_db === 'number' ? `${lastManualTest.power_variation_db.toFixed(3)} dB` : '-'}
                </p>
              </div>
            )}
          </div>

          <div className="card space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Creation d alarme manuelle (OTDR)</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm font-medium text-slate-700 space-y-1">
                <span>RTU</span>
                <select
                  value={form.rtuId}
                  onChange={(e) => handleRtuChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {groupedRoutes.map(([rtuId]) => (
                    <option key={rtuId} value={rtuId}>{rtuId}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1">
                <span>Route</span>
                <select
                  value={form.routeId}
                  onChange={(e) => handleChange('routeId', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {selectedRtuRoutes.map((route) => (
                    <option key={route.routeId} value={route.routeId}>{route.routeId}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1">
                <span>Type d alarme</span>
                <select
                  value={form.faultType}
                  onChange={(e) => handleChange('faultType', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="break">FIBER_BREAK</option>
                  <option value="degradation">DEGRADATION</option>
                  <option value="high_loss_splice">HIGH_EVENT_LOSS</option>
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1">
                <span>Cause de panne</span>
                <select
                  value={form.faultCause}
                  onChange={(e) => handleChange('faultCause', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {FAULT_CAUSES.map((cause) => (
                    <option key={cause} value={cause}>{cause}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1">
                <span>Localisation precise (texte)</span>
                <input
                  type="text"
                  value={form.faultLocationDescription}
                  onChange={(e) => handleChange('faultLocationDescription', e.target.value)}
                  placeholder="Ex: chambre C12, segment nord"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1">
                <span>Localisation (km)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.faultLocationKm}
                  onChange={(e) => handleChange('faultLocationKm', e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1">
                <span>Attenuation (dB)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.attenuationDb}
                  onChange={(e) => handleChange('attenuationDb', e.target.value)}
                  placeholder="10.50"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1">
                <span>Duree de reparation (secondes)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.repairDurationSeconds}
                  onChange={(e) => handleChange('repairDurationSeconds', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1 md:col-span-2">
                <span>Technicien assigne</span>
                <input
                  type="text"
                  value={form.technicianName}
                  onChange={(e) => handleChange('technicianName', e.target.value)}
                  placeholder="Nom du technicien ou equipe"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 space-y-1 md:col-span-2">
                <span>Description (optionnel)</span>
                <textarea
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={3}
                  placeholder="Description de la panne"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            <button
              onClick={handleCreateManualAlarm}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              <UserCheck className="w-4 h-4" />
              {submitting
                ? 'Assignation en cours...'
                : 'Assigner au technicien et lancer le timer de reparation'}
            </button>
          </div>

          <div className="card">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Alarmes actives en cours de reparation</h3>

            {activeAlarms.length === 0 ? (
              <p className="text-sm text-slate-600">Aucune alarme active.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="pb-2 pr-4">RTU</th>
                      <th className="pb-2 pr-4">Route</th>
                      <th className="pb-2 pr-4">Cause</th>
                      <th className="pb-2 pr-4">Debut</th>
                      <th className="pb-2 pr-4">Fin prevue</th>
                      <th className="pb-2">Compte a rebours</th>
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
                          <td className="py-2 pr-4 text-slate-700">{cause}</td>
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

          <div className="card">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Etat des routes</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="pb-2 pr-4">RTU</th>
                    <th className="pb-2 pr-4">Route</th>
                    <th className="pb-2 pr-4">Etat route</th>
                    <th className="pb-2">Alarme active</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((route) => {
                    const hasActiveAlarm = activeRouteSet.has(route.routeId);
                    return (
                      <tr key={route.routeId} className="border-b border-slate-100">
                        <td className="py-2 pr-4 text-slate-700">{route.rtuId}</td>
                        <td className="py-2 pr-4 font-semibold text-slate-800">{route.routeId}</td>
                        <td className="py-2 pr-4 text-slate-600">{route.status || 'UNKNOWN'}</td>
                        <td className="py-2">
                          {hasActiveAlarm ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                              <AlertTriangle className="w-3 h-3" /> ACTIVE
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                              NONE
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default TestControlPage;
