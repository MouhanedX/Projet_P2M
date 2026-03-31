import { useState, useEffect } from 'react';
import { kpisAPI, alarmsAPI, routesAPI, otdrAPI, rtusAPI } from '../services/api';
import websocketService from '../services/websocket';
import KpiCard from './KpiCard';
import AlarmList from './AlarmList';
import NetworkStatusChart from './NetworkStatusChart';
import AlarmTimeline from './AlarmTimeline';
import RealtimeChart from './RealtimeChart';
import { AlertCircle, Activity, TrendingUp, Router, Wifi, WifiOff, Clock, ShieldCheck, Flame, GaugeCircle, BarChart3, Sparkles, Radar, ShieldAlert, ExternalLink } from 'lucide-react';

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

function Dashboard() {
  const standaloneMapUrl = 'http://localhost:8090';
  const [kpi, setKpi] = useState(null);
  const [alarms, setAlarms] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [wsConnected, setWsConnected] = useState(false);
  const [kpiHistory, setKpiHistory] = useState([]);
  const [activeView, setActiveView] = useState('noc');
  const [routes, setRoutes] = useState([]);
  const [rtuStatus, setRtuStatus] = useState(null);
  const [recentTests, setRecentTests] = useState([]);

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
        setLastUpdate(new Date());
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
      setKpiHistory(prev => [...prev.slice(-19), { 
        timestamp: new Date(), 
        availability: response.data.metrics.networkAvailabilityPercent,
        alarms: response.data.metrics.totalAlarmsActive
      }]);
      setLastUpdate(new Date());
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
      // Get all RTUs first
      const rtusResponse = await rtusAPI.getAll();
      const allRtus = Array.isArray(rtusResponse.data) ? rtusResponse.data : rtusResponse.data.value || [];
      
      // Fetch routes for each RTU from database
      const allRoutes = [];
      for (const rtu of allRtus) {
        try {
          const routesResponse = await rtusAPI.getRoutes(rtu.rtu_id);
          const rtuRoutes = Array.isArray(routesResponse.data) ? routesResponse.data : routesResponse.data.routes || [];
          allRoutes.push(...rtuRoutes);
        } catch (err) {
          console.error(`Error loading routes for RTU ${rtu.rtu_id}:`, err);
        }
      }
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
      const rtus = Array.isArray(response.data) ? response.data : response.data.value || [];
      setRtuStatus(rtus);
    } catch (error) {
      console.error('Error loading RTU status:', error);
      setRtuStatus(null);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-cyan-50">
      <div className="space-y-6 p-6">
        <div className="card relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-900 to-sky-900 text-white shadow-2xl">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-400/20 blur-2xl" />
          <div className="absolute -left-20 -bottom-20 h-52 w-52 rounded-full bg-purple-500/20 blur-2xl" />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold flex items-center space-x-3">
                <Radar className="w-8 h-8 animate-pulse" />
                <span>Network Operations Center</span>
              </h2>
              <p className="text-sm opacity-90 mt-2 flex items-center space-x-2">
                <Clock className="w-4 h-4" />
                <span>Last updated: {lastUpdate.toLocaleTimeString()} • Auto-refresh every 2 minutes</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><Sparkles className="h-3.5 w-3.5" /> Creative UI</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><Router className="h-3.5 w-3.5" /> {routes.length} Routes</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><ShieldAlert className="h-3.5 w-3.5" /> {kpi?.metrics?.totalAlarmsActive || 0} Active Alarms</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg backdrop-blur-sm ${wsConnected ? 'bg-green-500/80' : 'bg-red-500/80'} animate-pulse`}>
                {wsConnected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                <span className="text-sm font-medium">
                  {wsConnected ? 'Live Connection' : 'Reconnecting...'}
                </span>
              </div>
              <button
                onClick={loadInitialData}
                className="px-4 py-2 bg-white text-blue-600 rounded-lg font-medium hover:bg-gray-100 transition-all hover:scale-105 flex items-center space-x-2 shadow-lg"
              >
                <Activity className="w-4 h-4" />
                <span>Refresh Now</span>
              </button>
            </div>
          </div>
        </div>

        <div className="card shadow-lg">
          <div className="flex space-x-2 border-b border-gray-200">
            {[
              { id: 'noc', label: 'NOC Real-time', icon: Radar },
              { id: 'network', label: 'Réseau Optique', icon: Router },
              { id: 'quality', label: 'Qualité & Historique', icon: TrendingUp }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveView(id)}
                className={`px-6 py-4 font-medium transition-all flex items-center space-x-2 ${
                  activeView === id
                    ? 'text-blue-600 border-b-4 border-blue-600 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
          />
          <KpiCard
            title="Total Routes"
            value={kpi?.metrics?.totalRoutes || 0}
            icon={<Router className="w-6 h-6" />}
            subtitle={`${kpi?.metrics?.routesNormal || 0} normal`}
            color="blue"
          />
          <KpiCard
            title="Avg Fiber Loss"
            value={kpi?.performance?.avgFiberLossDb || 0}
            unit="dB"
            icon={<TrendingUp className="w-6 h-6" />}
            subtitle={`Max: ${kpi?.performance?.maxFiberLossDb?.toFixed(2) || 0} dB`}
            color="yellow"
          />
        </div>

        {activeView === 'noc' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <div className="card bg-gradient-to-br from-emerald-50 to-green-100">
                <p className="text-xs font-semibold text-slate-600">RTU Status</p>
                <p className="mt-2 text-2xl font-bold text-emerald-700">{rtuStatus?.ems_connected ? 'Online' : 'Offline'}</p>
              </div>
              <div className="card bg-gradient-to-br from-cyan-50 to-sky-100">
                <p className="text-xs font-semibold text-slate-600">Power Supply</p>
                <p className="mt-2 text-2xl font-bold text-sky-700">{rtuStatus?.power_supply || 'Normal'}</p>
              </div>
              <div className="card bg-gradient-to-br from-amber-50 to-orange-100">
                <p className="text-xs font-semibold text-slate-600">Temperature</p>
                <p className="mt-2 text-2xl font-bold text-orange-700">{rtuStatus?.temperature_c?.toFixed?.(1) ?? '0.0'}°C</p>
                <div className="mt-3 h-2 w-full rounded-full bg-orange-200">
                  <div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.min(100, Math.max(5, ((rtuStatus?.temperature_c || 0) / 70) * 100))}%` }} />
                </div>
              </div>
              <div className="card bg-gradient-to-br from-violet-50 to-purple-100">
                <p className="text-xs font-semibold text-slate-600">Communication</p>
                <p className="mt-2 text-2xl font-bold text-purple-700">{rtuStatus?.communication || 'Connected'}</p>
              </div>
              <div className="card bg-gradient-to-br from-blue-50 to-indigo-100">
                <p className="text-xs font-semibold text-slate-600">OTDR Availability</p>
                <p className="mt-2 text-2xl font-bold text-indigo-700">{rtuStatus?.otdr_availability || 'Ready'}</p>
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
                    <div key={route.routeId} className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-indigo-50 p-4 shadow-sm">
                      <p className="text-xs font-semibold text-indigo-600">{route.routeId}</p>
                      <p className="text-sm font-bold text-slate-900 mt-1">{route.routeName}</p>
                      <p className="text-xs text-slate-500 mt-1">{route.region} • {route?.fiberSpec?.lengthKm ?? '-'} km</p>
                      <div className="mt-3 inline-flex rounded-full bg-slate-900/5 px-2.5 py-1 text-xs font-medium text-slate-700">
                        Status: {route.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

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

        {activeView === 'network' && (
          <>
            <div className="card shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center space-x-2">
                  <Router className="w-5 h-5 text-blue-600" />
                  <span>Network Topology</span>
                </h3>
                <button
                  onClick={() => window.open(standaloneMapUrl, '_blank', 'noopener,noreferrer')}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
                  title="Open full map in new window"
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

        {activeView === 'quality' && (
          <>
            <div className="card shadow-lg">
              <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <span>Real-time Network Performance</span>
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                📈 Live monitoring of network availability and active alarms over time
              </p>
              <RealtimeChart data={kpiHistory} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="card bg-gradient-to-br from-green-50 to-emerald-100 shadow-lg hover:shadow-xl transition-shadow">
                <h4 className="font-semibold text-gray-700 mb-2 flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-green-600" />
                  <span>Uptime</span>
                </h4>
                <p className="text-4xl font-bold text-green-600">
                  {kpi?.availability?.uptimePercent?.toFixed(1) || 0}%
                </p>
                <p className="text-sm text-gray-600 mt-2">Network uptime</p>
              </div>

              <div className="card bg-gradient-to-br from-blue-50 to-cyan-100 shadow-lg hover:shadow-xl transition-shadow">
                <h4 className="font-semibold text-gray-700 mb-2 flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>MTTR</span>
                </h4>
                <p className="text-4xl font-bold text-blue-600">
                  {kpi?.availability?.mttrHours?.toFixed(1) || 0}h
                </p>
                <p className="text-sm text-gray-600 mt-2">Mean Time To Repair</p>
              </div>

              <div className="card bg-gradient-to-br from-purple-50 to-pink-100 shadow-lg hover:shadow-xl transition-shadow">
                <h4 className="font-semibold text-gray-700 mb-2 flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                  <span>MTBF</span>
                </h4>
                <p className="text-4xl font-bold text-purple-600">
                  {kpi?.availability?.mtbfHours?.toFixed(0) || 0}h
                </p>
                <p className="text-sm text-gray-600 mt-2">Mean Time Between Failures</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="card">
                <p className="text-xs font-semibold text-slate-500">Hour-over-Hour</p>
                <p className="mt-2 text-2xl font-bold text-slate-800">{kpi?.trend?.hourOverHourChangePercent?.toFixed?.(2) ?? 0}%</p>
              </div>
              <div className="card">
                <p className="text-xs font-semibold text-slate-500">Day-over-Day</p>
                <p className="mt-2 text-2xl font-bold text-slate-800">{kpi?.trend?.dayOverDayChangePercent?.toFixed?.(2) ?? 0}%</p>
              </div>
              <div className="card">
                <p className="text-xs font-semibold text-slate-500">Week-over-Week</p>
                <p className="mt-2 text-2xl font-bold text-slate-800">{kpi?.trend?.weekOverWeekChangePercent?.toFixed?.(2) ?? 0}%</p>
              </div>
            </div>

            <div className="card shadow-lg">
              <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <Flame className="w-5 h-5 text-rose-600" />
                <span>Periodic Quality Report (Recent OTDR Runs)</span>
              </h3>
              <div className="max-h-72 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="pb-2 pr-2">Timestamp</th>
                      <th className="pb-2 pr-2">Route</th>
                      <th className="pb-2 pr-2">Loss</th>
                      <th className="pb-2 pr-2">Status</th>
                      <th className="pb-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTests.map((test) => (
                      <tr key={`quality-${test.id || `${test.routeId}-${test.measuredAt}`}`} className="border-t border-slate-100">
                        <td className="py-2 pr-2 text-slate-500">{test.measuredAt ? new Date(test.measuredAt).toLocaleString() : '-'}</td>
                        <td className="py-2 pr-2 font-medium text-slate-700">{test.routeId}</td>
                        <td className="py-2 pr-2 text-slate-600">{test.totalLossDb?.toFixed?.(2) ?? '-'} dB</td>
                        <td className="py-2 pr-2 text-slate-600">{test.status}</td>
                        <td className="py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${test.testResult === 'Pass' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {test.testResult}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
