import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { kpisAPI, alarmsAPI, routesAPI, otdrAPI, rtusAPI } from '../services/api';
import websocketService from '../services/websocket';
import KpiCard from './KpiCard';
import AlarmList from './AlarmList';
import NetworkStatusChart from './NetworkStatusChart';
import { AlertCircle, Activity, Router, Wifi, WifiOff, ShieldCheck, GaugeCircle, Radar, ExternalLink, History, X } from 'lucide-react';

const STANDALONE_TOPOLOGY = {
  central: {
    id: 'NOC_TN_CENTRAL',
    name: 'National NOC',
    city: 'Tunis Central',
    color: '#ff0a54'
  },
  rtus: [
    { id: 'RTU_TN_01', name: 'Tunis Core RTU', city: 'Tunis', color: '#00d4aa' },
    { id: 'RTU_TN_02', name: 'Kef Metro RTU', city: 'Kef', color: '#0084ff' },
    { id: 'RTU_TN_03', name: 'Sidi Bouzid Hub RTU', city: 'Sidi Bouzid', color: '#00ff88' },
    { id: 'RTU_TN_04', name: 'Kairouan Inland RTU', city: 'Kairouan', color: '#b500d8' },
    { id: 'RTU_TN_05', name: 'Gafsa South RTU', city: 'Gafsa', color: '#ffb700' }
  ],
  routesByRtu: {
    RTU_TN_01: [
      { id: 'RTU_TN_01_R1', distanceKm: 10 },
      { id: 'RTU_TN_01_R2', distanceKm: 4 },
      { id: 'RTU_TN_01_R3', distanceKm: 11 }
    ],
    RTU_TN_02: [
      { id: 'RTU_TN_02_R1', distanceKm: 2 },
      { id: 'RTU_TN_02_R2', distanceKm: 1 },
      { id: 'RTU_TN_02_R3', distanceKm: 2 }
    ],
    RTU_TN_03: [
      { id: 'RTU_TN_03_R1', distanceKm: 1 },
      { id: 'RTU_TN_03_R2', distanceKm: 3 },
      { id: 'RTU_TN_03_R3', distanceKm: 2 }
    ],
    RTU_TN_04: [
      { id: 'RTU_TN_04_R1', distanceKm: 3 },
      { id: 'RTU_TN_04_R2', distanceKm: 3 },
      { id: 'RTU_TN_04_R3', distanceKm: 2 }
    ],
    RTU_TN_05: [
      { id: 'RTU_TN_05_R1', distanceKm: 3 },
      { id: 'RTU_TN_05_R2', distanceKm: 2 },
      { id: 'RTU_TN_05_R3', distanceKm: 2 }
    ]
  },
  backboneByRtu: {
    RTU_TN_01: 38,
    RTU_TN_02: 170,
    RTU_TN_03: 211,
    RTU_TN_04: 135,
    RTU_TN_05: 308
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

function Dashboard() {
  const navigate = useNavigate();
  const [kpi, setKpi] = useState(null);
  const [alarms, setAlarms] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeView, setActiveView] = useState('noc');
  const [routes, setRoutes] = useState([]);
  const [rtus, setRtus] = useState([]);
  const [selectedRtuId, setSelectedRtuId] = useState('');
  const [selectedRtuDetails, setSelectedRtuDetails] = useState(null);
  const [recentTests, setRecentTests] = useState([]);
  const [selectedRouteHistory, setSelectedRouteHistory] = useState(null);
  const [routeHistoryAlarms, setRouteHistoryAlarms] = useState([]);
  const [routeHistoryLoading, setRouteHistoryLoading] = useState(false);

  useEffect(() => {
    loadInitialData();

    let alarmSub = null;
    let kpiSub = null;

    const subscribeToTopics = () => {
      if (alarmSub) {
        alarmSub.unsubscribe();
        alarmSub = null;
      }
      if (kpiSub) {
        kpiSub.unsubscribe();
        kpiSub = null;
      }

      alarmSub = websocketService.subscribe('/topic/alarms', (alarm) => {
        console.log('New alarm received:', alarm);
        setAlarms(prev => [alarm, ...prev].slice(0, 50));
        loadAlarmStatistics();
        setWsConnected(true);
      });

      kpiSub = websocketService.subscribe('/topic/kpis', (newKpi) => {
        console.log('New KPI received:', newKpi);
        setKpi(newKpi);
        setWsConnected(true);
      });
    };

    websocketService.connect(
      () => {
        setWsConnected(true);
        subscribeToTopics();
      },
      () => {
        setWsConnected(false);
      }
    );

    const interval = setInterval(() => {
      console.log('Auto-refresh triggered (2 minutes)');
      loadKpiData();
      loadAlarmStatistics();
      loadActiveAlarms();
      loadRoutes();
      loadRtuStatus();
      loadRecentTests();
      setWsConnected(websocketService.isConnected());
    }, 120000);

    return () => {
      if (alarmSub) alarmSub.unsubscribe();
      if (kpiSub) kpiSub.unsubscribe();
      websocketService.disconnect();
      clearInterval(interval);
    };
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadKpiData(),
        loadActiveAlarms(),
        loadAlarmStatistics(),
        loadRoutes(),
        loadRtuStatus(),
        loadRecentTests()
      ]);
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadKpiData = async () => {
    try {
      const response = await kpisAPI.getNetworkHealth();
      setKpi(response.data);
    } catch (error) {
      console.error('Error loading KPI data:', error);
    }
  };

  const loadActiveAlarms = async () => {
    try {
      const response = await alarmsAPI.getActive();
      setAlarms(response.data.slice(0, 50));
    } catch (error) {
      console.error('Error loading alarms:', error);
    }
  };

  const loadAlarmStatistics = async () => {
    try {
      const response = await alarmsAPI.getStatistics();
      const payload = response.data || {};
      setStats({
        total: payload.totalAlarms ?? 0,
        critical: payload.criticalAlarms ?? 0,
        high: payload.highAlarms ?? 0,
        medium: payload.mediumAlarms ?? 0,
        low: payload.lowAlarms ?? 0
      });
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  const loadRoutes = async () => {
    try {
      // Route inventory should come from EMS backend (single source of truth).
      const response = await routesAPI.getAll();
      const allRoutes = Array.isArray(response.data) ? response.data : response.data.value || [];
      setRoutes(allRoutes);
    } catch (error) {
      console.error('Error loading routes:', error);
      setRoutes([]);
    }
  };

  const loadRtuStatus = async () => {
    try {
      // Get all RTUs from database
      const response = await rtusAPI.getAll();
      const allRtus = Array.isArray(response.data) ? response.data : response.data.value || [];
      setRtus(allRtus);

      const preferredRtuId = selectedRtuId && allRtus.some((item) => item.rtu_id === selectedRtuId)
        ? selectedRtuId
        : allRtus[0]?.rtu_id || '';

      if (preferredRtuId) {
        setSelectedRtuId(preferredRtuId);
        await loadSelectedRtuDetails(preferredRtuId);
      } else {
        setSelectedRtuId('');
        setSelectedRtuDetails(null);
      }
    } catch (error) {
      console.error('Error loading RTU status:', error);
      setRtus([]);
      setSelectedRtuDetails(null);
    }
  };

  const loadSelectedRtuDetails = async (rtuId) => {
    try {
      if (!rtuId) {
        setSelectedRtuDetails(null);
        return;
      }

      const response = await rtusAPI.getStatus(rtuId);
      setSelectedRtuDetails(response.data || null);
    } catch (error) {
      console.error(`Error loading details for RTU ${rtuId}:`, error);
      setSelectedRtuDetails(null);
    }
  };

  const loadRecentTests = async () => {
    try {
      const response = await otdrAPI.getRecent(15);
      setRecentTests(response.data || []);
    } catch (error) {
      console.error('Error loading OTDR tests:', error);
      setRecentTests([]);
    }
  };

  const openRouteHistory = async (route) => {
    setSelectedRouteHistory(route);
    setRouteHistoryLoading(true);
    setRouteHistoryAlarms([]);
    try {
      const response = await alarmsAPI.getByRoute(route.routeId);
      setRouteHistoryAlarms(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error(`Error loading alarm history for route ${route.routeId}:`, error);
      setRouteHistoryAlarms([]);
    } finally {
      setRouteHistoryLoading(false);
    }
  };

  const closeRouteHistory = () => {
    setSelectedRouteHistory(null);
    setRouteHistoryAlarms([]);
    setRouteHistoryLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-32 w-32 border-b-4 border-t-4 border-blue-600 mx-auto"></div>
            <Activity className="w-12 h-12 text-blue-600 absolute top-10 left-10 animate-pulse" />
          </div>
          <p className="text-xl font-bold text-gray-700 mt-6 animate-pulse">Loading NQMS Dashboard...</p>
          <p className="text-sm text-gray-500 mt-2">Connecting to MongoDB Atlas...</p>
        </div>
      </div>
    );
  }

  const topologyRtus = STANDALONE_TOPOLOGY.rtus.map((rtu) => ({
    ...rtu,
    routes: STANDALONE_TOPOLOGY.routesByRtu[rtu.id] || [],
    backboneKm: STANDALONE_TOPOLOGY.backboneByRtu[rtu.id] || 0
  }));
  const totalStandaloneRoutes = Object.values(STANDALONE_TOPOLOGY.routesByRtu).reduce((sum, list) => sum + list.length, 0);
  const averageRtuTemperature = rtus.length > 0
    ? rtus.reduce((sum, item) => sum + (item.temperature_c || 0), 0) / rtus.length
    : 0;
  const selectedRtuSummary = rtus.find((item) => item.rtu_id === selectedRtuId) || null;
  const fallbackSelectedRoutes = routes
    .filter((item) => item.rtuId === selectedRtuId)
    .map((item) => ({
      route_id: item.routeId,
      current_status: item.status,
      fiber_length_km: item?.fiberSpec?.lengthKm,
      active_alarms: item?.currentCondition?.activeAlarms ?? 0
    }));
  const selectedRtuRoutes = selectedRtuDetails?.routes?.length
    ? selectedRtuDetails.routes
    : fallbackSelectedRoutes;

  return (
    <div className="min-h-screen bg-white">
      <div className="space-y-6 px-3 py-4 sm:px-5 lg:px-8">
        <div className="sticky top-3 z-20 flex justify-center">
          <div className="w-full rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {[
                { id: 'noc', label: 'NOC Real-time', icon: Radar },
                { id: 'rtus', label: 'RTUs', icon: Activity },
                { id: 'network', label: 'Réseau Optique', icon: Router }
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveView(id)}
                  className={`min-w-[170px] rounded-xl px-5 py-3 font-medium transition-all flex items-center justify-center space-x-2 ${
                    activeView === id
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-300'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card relative overflow-hidden bg-white text-slate-900 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold flex items-center space-x-3">
                <Radar className="w-8 h-8 animate-pulse" />
                <span>Network Operations Center</span>
              </h2>
            </div>
            <div className="flex items-center space-x-4">
              <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg backdrop-blur-sm ${wsConnected ? 'bg-green-500/80' : 'bg-red-500/80'} animate-pulse`}>
                {wsConnected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                <span className="text-sm font-medium">
                  {wsConnected ? 'Live Connection' : 'Reconnecting...'}
                </span>
              </div>
              <button
                onClick={() => navigate('/test')}
                className="px-4 py-2 bg-amber-400 text-slate-900 rounded-lg font-semibold hover:bg-amber-300 transition-all hover:scale-105 flex items-center space-x-2 shadow-lg"
              >
                <span>Test</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <KpiCard
            title="Network Availability"
            value={kpi?.metrics?.networkAvailabilityPercent || 0}
            unit="%"
            icon={<Activity className="w-6 h-6" />}
            trend={kpi?.trend?.hourOverHourChangePercent}
            color={kpi?.metrics?.networkAvailabilityPercent >= 95 ? 'green' : 'red'}
          />
          <KpiCard
            title="Active Alarms"
            value={kpi?.metrics?.totalAlarmsActive || 0}
            icon={<AlertCircle className="w-6 h-6" />}
            subtitle={`${kpi?.metrics?.criticalAlarms || 0} critical`}
            color={kpi?.metrics?.criticalAlarms > 0 ? 'red' : 'yellow'}
            isInteger={true}
          />
          <KpiCard
            title="Total Routes"
            value={kpi?.metrics?.totalRoutes || 0}
            icon={<Router className="w-6 h-6" />}
            subtitle={`${kpi?.metrics?.routesNormal || 0} normal`}
            color="blue"
            isInteger={true}
          />
        </div>

        {activeView === 'noc' && (
          <>
            <div className="grid grid-cols-1 gap-4">
              <div className="card bg-gradient-to-br from-amber-50 to-orange-100">
                <p className="text-xs font-semibold text-slate-600">Avg Temperature</p>
                <p className="mt-2 text-2xl font-bold text-orange-700">{averageRtuTemperature.toFixed(1)}°C</p>
                <div className="mt-3 h-2 w-full rounded-full bg-orange-200">
                  <div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.min(100, Math.max(5, (averageRtuTemperature / 70) * 100))}%` }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card shadow-lg hover:shadow-xl transition-shadow">
                <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                  <Router className="w-5 h-5 text-blue-600" />
                  <span>Route Status Distribution</span>
                </h3>
                <NetworkStatusChart kpi={kpi} />
              </div>

              <div className="card shadow-lg hover:shadow-xl transition-shadow">
                <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <span>Alarm Severity Breakdown</span>
                </h3>
                {stats && (
                  <div className="space-y-4">
                    <AlarmSeverityBar label="Critical" count={stats.critical} total={stats.total} color="bg-red-500" />
                    <AlarmSeverityBar label="High" count={stats.high} total={stats.total} color="bg-orange-500" />
                    <AlarmSeverityBar label="Medium" count={stats.medium} total={stats.total} color="bg-yellow-500" />
                    <AlarmSeverityBar label="Low" count={stats.low} total={stats.total} color="bg-blue-500" />
                  </div>
                )}
              </div>
            </div>

            <div className="card shadow-lg">
              <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <Router className="w-5 h-5 text-indigo-600" />
                <span>Live Route Inventory ({routes.length})</span>
              </h3>
              {routes.length === 0 ? (
                <p className="text-sm text-gray-500">No routes loaded yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {routes.map((route) => (
                    <button
                      type="button"
                      key={route.routeId}
                      onClick={() => openRouteHistory(route)}
                      className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-indigo-50 p-4 shadow-sm text-left transition-all hover:shadow-md hover:border-indigo-300"
                    >
                      <p className="text-xs font-semibold text-indigo-600">{route.routeId}</p>
                      <p className="text-sm font-bold text-slate-900 mt-1">{route.routeName}</p>
                      <p className="text-xs text-slate-500 mt-1">{route.region} • {route?.fiberSpec?.lengthKm ?? '-'} km</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="inline-flex rounded-full bg-slate-900/5 px-2.5 py-1 text-xs font-medium text-slate-700">
                          Status: {route.status}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                          <History className="w-3 h-3" /> History
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedRouteHistory && (
              <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-6xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                  <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-bold text-slate-900">Route Alarm History</h4>
                      <p className="text-sm text-slate-600 mt-1">
                        {selectedRouteHistory.routeId} • {selectedRouteHistory.routeName} • {selectedRouteHistory.rtuId}
                      </p>
                    </div>
                    <button
                      onClick={closeRouteHistory}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
                    >
                      <X className="w-4 h-4" /> Close
                    </button>
                  </div>

                  <div className="px-5 py-4 overflow-auto max-h-[70vh]">
                    {routeHistoryLoading ? (
                      <p className="text-sm text-slate-600">Loading alarm history...</p>
                    ) : routeHistoryAlarms.length === 0 ? (
                      <p className="text-sm text-slate-600">No alarms found for this route.</p>
                    ) : (
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-500 border-b border-slate-200">
                            <th className="pb-2 pr-4">Status</th>
                            <th className="pb-2 pr-4">Type</th>
                            <th className="pb-2 pr-4">Cause</th>
                            <th className="pb-2 pr-4">Location</th>
                            <th className="pb-2 pr-4">Attenuation</th>
                            <th className="pb-2 pr-4">Start Time</th>
                            <th className="pb-2 pr-4">End Time</th>
                            <th className="pb-2">Technician</th>
                          </tr>
                        </thead>
                        <tbody>
                          {routeHistoryAlarms.map((alarm) => {
                            const lifecycle = alarm.lifecycle || {};
                            const details = alarm.details || {};
                            const start = parseTimestamp(lifecycle.createdAt || lifecycle.created_at);
                            const end = parseTimestamp(lifecycle.resolvedAt || lifecycle.resolved_at);

                            return (
                              <tr key={alarm.alarmId || alarm.alarm_id || alarm.id} className="border-b border-slate-100">
                                <td className="py-2 pr-4">
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${alarm.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                    {alarm.status}
                                  </span>
                                </td>
                                <td className="py-2 pr-4 text-slate-700">{alarm.alarmType || alarm.alarm_type || '-'}</td>
                                <td className="py-2 pr-4 text-slate-700">{details.faultCause || details.fault_cause || details.eventType || details.event_type || '-'}</td>
                                <td className="py-2 pr-4 text-slate-700">{details.faultLocationDescription || details.fault_location_description || details.eventLocationKm || details.event_location_km || '-'}</td>
                                <td className="py-2 pr-4 text-slate-700">
                                  {details.attenuationDb ?? details.attenuation_db ?? details.totalLossDb ?? details.total_loss_db ?? '-'}
                                </td>
                                <td className="py-2 pr-4 text-slate-600">{start ? start.toLocaleString() : '-'}</td>
                                <td className="py-2 pr-4 text-slate-600">{end ? end.toLocaleString() : '-'}</td>
                                <td className="py-2 text-slate-700">{lifecycle.assignedBy || lifecycle.assigned_by || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="card shadow-lg">
              <h3 className="text-lg font-semibold mb-4 flex items-center justify-between">
                <span className="flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <span>Active Alarms ({alarms.length})</span>
                </span>
                {alarms.length > 0 && (
                  <span className="px-4 py-2 bg-red-100 text-red-800 rounded-full text-sm font-medium animate-pulse shadow-md">
                    ⚠️ Requires Attention
                  </span>
                )}
              </h3>
              <AlarmList alarms={alarms} onRefresh={loadActiveAlarms} />
            </div>
          </>
        )}

        {activeView === 'rtus' && (
          <>
            <div className="card shadow-lg">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">RTUs Section</h3>
                  <p className="text-sm text-slate-500">Select one RTU to inspect its live metrics and assigned routes.</p>
                </div>
                <div className="w-full md:w-96">
                  <label htmlFor="rtuSelector" className="mb-1 block text-sm font-semibold text-slate-700">Choose RTU</label>
                  <select
                    id="rtuSelector"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                    value={selectedRtuId}
                    onChange={async (event) => {
                      const nextRtuId = event.target.value;
                      setSelectedRtuId(nextRtuId);
                      await loadSelectedRtuDetails(nextRtuId);
                    }}
                  >
                    {rtus.length === 0 && <option value="">No RTUs available</option>}
                    {rtus.map((item) => (
                      <option key={item.rtu_id} value={item.rtu_id}>{item.rtu_id}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <div className="card bg-gradient-to-br from-emerald-50 to-green-100">
                <p className="text-xs font-semibold text-slate-600">RTU Status</p>
                <p className={`mt-2 text-2xl font-bold ${selectedRtuSummary?.ems_connected ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {selectedRtuSummary?.ems_connected ? 'Online' : 'Offline'}
                </p>
              </div>

              <div className="card bg-gradient-to-br from-cyan-50 to-sky-100">
                <p className="text-xs font-semibold text-slate-600">Monitoring</p>
                <p className={`mt-2 text-2xl font-bold ${selectedRtuSummary?.is_monitoring ? 'text-sky-700' : 'text-slate-700'}`}>
                  {selectedRtuSummary?.is_monitoring ? 'Running' : 'Stopped'}
                </p>
              </div>

              <div className="card bg-gradient-to-br from-amber-50 to-orange-100">
                <p className="text-xs font-semibold text-slate-600">Temperature</p>
                <p className="mt-2 text-2xl font-bold text-orange-700">{selectedRtuSummary?.temperature_c?.toFixed?.(1) ?? '0.0'}°C</p>
              </div>

              <div className="card bg-gradient-to-br from-violet-50 to-purple-100">
                <p className="text-xs font-semibold text-slate-600">Routes</p>
                <p className="mt-2 text-2xl font-bold text-purple-700">{selectedRtuSummary?.routes_count ?? selectedRtuRoutes.length}</p>
              </div>

              <div className="card bg-gradient-to-br from-blue-50 to-indigo-100">
                <p className="text-xs font-semibold text-slate-600">Active Alarms</p>
                <p className="mt-2 text-2xl font-bold text-indigo-700">{selectedRtuSummary?.active_alarms ?? 0}</p>
              </div>
            </div>

            <div className="card shadow-lg">
              <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <Router className="w-5 h-5 text-indigo-600" />
                <span>Routes in {selectedRtuId || 'Selected RTU'}</span>
              </h3>

              {selectedRtuRoutes.length === 0 ? (
                <p className="text-sm text-gray-500">No route data available for this RTU.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="pb-2 pr-3">Route</th>
                        <th className="pb-2 pr-3">Status</th>
                        <th className="pb-2 pr-3">Fiber Length</th>
                        <th className="pb-2">Active Alarms</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRtuRoutes.map((route) => (
                        <tr key={route.route_id || route.routeId} className="border-b border-slate-100">
                          <td className="py-2 pr-3 font-medium text-slate-700">{route.route_id || route.routeId}</td>
                          <td className="py-2 pr-3 text-slate-600">{route.current_status?.toString?.() || route.status || 'UNKNOWN'}</td>
                          <td className="py-2 pr-3 text-slate-600">{route.fiber_length_km ?? route?.fiberSpec?.lengthKm ?? '-'} km</td>
                          <td className="py-2 text-slate-600">{route.active_alarms ?? route?.currentCondition?.activeAlarms ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedRtuDetails && (
              <div className="card shadow-lg">
                <h3 className="text-lg font-semibold mb-4">Additional RTU Metrics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500">Power Supply</p>
                    <p className="mt-2 text-xl font-bold text-slate-800">{selectedRtuDetails.power_supply || 'Normal'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500">Communication</p>
                    <p className="mt-2 text-xl font-bold text-slate-800">{selectedRtuDetails.communication || 'Connected'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500">OTDR Availability</p>
                    <p className="mt-2 text-xl font-bold text-slate-800">{selectedRtuDetails.otdr_availability || 'Ready'}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeView === 'network' && (
          <>
            <div className="card shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center space-x-2">
                  <Router className="w-5 h-5 text-blue-600" />
                  <span>Network Topology</span>
                </h3>
                <button
                  onClick={() => window.open('http://localhost:8090', '_blank', 'noopener,noreferrer')}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
                  title="Open standalone RTU map"
                >
                  <span className="text-sm font-medium">Full Map</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Open the standalone RTU map in a new page for the full interactive topology view.
              </p>
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-cyan-50 p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {STANDALONE_TOPOLOGY.rtus.length} RTUs + 1 NOC
                  </span>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                    {totalStandaloneRoutes} Fiber Routes
                  </span>
                  <span className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                    {topologyRtus.length} Backbone Links to NOC
                  </span>
                </div>

                <div className="relative h-80 rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 320" preserveAspectRatio="none">
                    {topologyRtus.map((rtu, idx) => {
                      const angle = (idx / Math.max(topologyRtus.length, 1)) * Math.PI * 2;
                      const x = 400 + 260 * Math.cos(angle);
                      const y = 160 + 105 * Math.sin(angle);

                      return (
                        <line
                          key={`line-${rtu.id}`}
                          x1="400"
                          y1="160"
                          x2={x}
                          y2={y}
                          stroke={rtu.color}
                          strokeWidth="2.5"
                          strokeDasharray="6 4"
                          opacity="0.9"
                        />
                      );
                    })}
                  </svg>

                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="rounded-full border-4 border-white bg-gradient-to-br from-blue-600 to-indigo-700 px-6 py-4 text-center text-white shadow-lg">
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-90">Central Node</p>
                      <p className="text-sm font-bold">{STANDALONE_TOPOLOGY.central.id}</p>
                    </div>
                  </div>

                  {topologyRtus.map((rtu, idx) => {
                    const angle = (idx / Math.max(topologyRtus.length, 1)) * Math.PI * 2;
                    const left = 50 + 38 * Math.cos(angle);
                    const top = 50 + 34 * Math.sin(angle);

                    return (
                      <div
                        key={rtu.id}
                        className="absolute w-48 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm"
                        style={{ left: `${left}%`, top: `${top}%` }}
                      >
                        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">RTU Node</p>
                        <p className="truncate text-xs font-bold text-slate-800">{rtu.id}</p>
                        <p className="truncate text-[10px] text-slate-600">{rtu.city}</p>
                        <p className="mt-1 text-[10px] font-semibold" style={{ color: rtu.color }}>
                          Backbone to NOC: {rtu.backboneKm} km
                        </p>
                        <div className="mt-2 space-y-1 border-t border-slate-200 pt-1.5">
                          {rtu.routes.map((route) => (
                            <div key={`${rtu.id}-${route.id}`} className="flex items-center justify-between text-[10px]">
                              <span className="truncate font-semibold text-slate-700">{route.id}</span>
                              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                                {route.distanceKm} km
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="mt-4 text-sm text-slate-600">
                  Use the <span className="font-semibold text-slate-800">Full Map</span> button for the full standalone topology page.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card shadow-lg">
                <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                  <GaugeCircle className="w-5 h-5 text-amber-600" />
                  <span>Attenuation by Route (dB)</span>
                </h3>
                <div className="space-y-4">
                  {routes.map((route) => {
                    const loss = route?.currentCondition?.totalLossDb ?? 0;
                    const ratio = Math.min(100, (loss / 12) * 100);
                    return (
                      <div key={route.routeId}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-semibold text-slate-700">{route.routeId}</span>
                          <span className="text-slate-600">{loss.toFixed?.(2) ?? loss} dB</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-slate-200">
                          <div className={`h-2.5 rounded-full ${loss > 10 ? 'bg-red-500' : loss > 3 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${ratio}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card shadow-lg">
                <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-cyan-600" />
                  <span>Latest OTDR Tests</span>
                </h3>
                <div className="max-h-72 overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="pb-2 pr-2">Route</th>
                        <th className="pb-2 pr-2">Mode</th>
                        <th className="pb-2 pr-2">Wavelength</th>
                        <th className="pb-2 pr-2">Result</th>
                        <th className="pb-2">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTests.map((test) => (
                        <tr key={test.id || `${test.routeId}-${test.measuredAt}`} className="border-t border-slate-100">
                          <td className="py-2 pr-2 font-medium text-slate-700">{test.routeId}</td>
                          <td className="py-2 pr-2 text-slate-600">{test.testMode}</td>
                          <td className="py-2 pr-2 text-slate-600">{test.wavelengthNm} nm</td>
                          <td className="py-2 pr-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${test.testResult === 'Pass' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {test.testResult}
                            </span>
                          </td>
                          <td className="py-2 text-slate-500">{test.measuredAt ? new Date(test.measuredAt).toLocaleTimeString() : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

function AlarmSeverityBar({ label, count, total, color }) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="font-semibold text-gray-700">{label}</span>
        <span className="text-gray-600 font-medium">{count} of {total}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div
          className={`${color} h-3 rounded-full transition-all duration-700 ease-out shadow-inner`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default Dashboard;
