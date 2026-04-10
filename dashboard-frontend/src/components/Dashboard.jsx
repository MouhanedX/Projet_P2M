import { useState, useEffect } from 'react';
import { kpisAPI, alarmsAPI, routesAPI, otdrAPI, rtusAPI } from '../services/api';
import websocketService from '../services/websocket';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import topologyData from '../data/topology-data.json';
import KpiCard from './KpiCard';
import AlarmList from './AlarmList';
import NetworkStatusChart from './NetworkStatusChart';
import AvailabilityRangeChart from './AvailabilityRangeChart';
import { AlertCircle, Activity, Router, Wifi, WifiOff, ShieldCheck, Radar, ExternalLink, History, X } from 'lucide-react';

const TOPOLOGY_COLORS = ['#00d4aa', '#0084ff', '#00ff88', '#f97316', '#e11d48', '#a855f7', '#ffb700'];

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

const extractRtuHealth = (test) => {
  const rawHealth = test?.rtuHealth || test?.rtu_health;
  if (!rawHealth || typeof rawHealth !== 'object') {
    return null;
  }

  const temperatureC = rawHealth.temperatureC ?? rawHealth.temperature_c;
  const cpuUsagePercent = rawHealth.cpuUsagePercent ?? rawHealth.cpu_usage_percent;
  const memoryUsagePercent = rawHealth.memoryUsagePercent ?? rawHealth.memory_usage_percent;
  const powerSupplyStatus = rawHealth.powerSupplyStatus ?? rawHealth.power_supply_status;

  const hasAnyHealthValue = (
    temperatureC !== null && temperatureC !== undefined
  ) || (
    cpuUsagePercent !== null && cpuUsagePercent !== undefined
  ) || (
    memoryUsagePercent !== null && memoryUsagePercent !== undefined
  ) || (
    powerSupplyStatus !== null && powerSupplyStatus !== undefined && powerSupplyStatus !== ''
  );

  if (!hasAnyHealthValue) {
    return null;
  }

  return {
    temperatureC,
    cpuUsagePercent,
    memoryUsagePercent,
    powerSupplyStatus,
  };
};

const toFiniteNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const extractActiveRouteFault = (routeAlarms) => {
  const activeCandidates = (Array.isArray(routeAlarms) ? routeAlarms : [])
    .filter((alarm) => ['ACTIVE', 'ACKNOWLEDGED'].includes(String(alarm?.status || '').toUpperCase()));

  if (activeCandidates.length === 0) {
    return null;
  }

  const sorted = [...activeCandidates].sort((left, right) => {
    const leftTimestamp = parseTimestamp(
      left?.updatedAt
      || left?.updated_at
      || left?.lifecycle?.createdAt
      || left?.lifecycle?.created_at
    )?.getTime() || 0;

    const rightTimestamp = parseTimestamp(
      right?.updatedAt
      || right?.updated_at
      || right?.lifecycle?.createdAt
      || right?.lifecycle?.created_at
    )?.getTime() || 0;

    return rightTimestamp - leftTimestamp;
  });

  const selectedAlarm = sorted[0];
  const details = selectedAlarm?.details || {};

  return {
    alarmId: selectedAlarm?.alarmId || selectedAlarm?.alarm_id || selectedAlarm?.id || null,
    status: String(selectedAlarm?.status || ''),
    faultDistanceKm: toFiniteNumber(details.eventLocationKm ?? details.event_location_km),
    attenuationDb: toFiniteNumber(
      details.attenuationDb
      ?? details.attenuation_db
      ?? details.totalLossDb
      ?? details.total_loss_db
    ),
  };
};

const buildDistanceProfileSeries = (referencePoints, activeFault) => {
  const hasFaultEffect = Number.isFinite(activeFault?.faultDistanceKm)
    && Number.isFinite(activeFault?.attenuationDb)
    && activeFault.attenuationDb > 0;

  return (Array.isArray(referencePoints) ? referencePoints : [])
    .map((point) => {
      const distanceKm = toFiniteNumber(
        point?.distance_km
        ?? point?.distanceKm
        ?? point?.x
      );

      const referencePowerDb = toFiniteNumber(
        point?.power_db
        ?? point?.powerDb
        ?? point?.power
        ?? point?.y
      );

      if (distanceKm === null || referencePowerDb === null) {
        return null;
      }

      const adjustedPowerDb = hasFaultEffect && distanceKm >= activeFault.faultDistanceKm
        ? Math.max(0, referencePowerDb - activeFault.attenuationDb)
        : referencePowerDb;

      return {
        distanceKm: Number(distanceKm.toFixed(4)),
        referencePowerDb: Number(referencePowerDb.toFixed(3)),
        currentPowerDb: Number(adjustedPowerDb.toFixed(3)),
      };
    })
    .filter(Boolean);
};

function Dashboard({ activeView, setActiveView }) {
  const [kpi, setKpi] = useState(null);
  const [availabilityHistory, setAvailabilityHistory] = useState([]);
  const [alarms, setAlarms] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [rtus, setRtus] = useState([]);
  const [selectedRtuId, setSelectedRtuId] = useState('');
  const [selectedRtuHealth, setSelectedRtuHealth] = useState(null);
  const [selectedRtuHealthLoading, setSelectedRtuHealthLoading] = useState(false);
  const [recentTests, setRecentTests] = useState([]);
  const [selectedRouteHistory, setSelectedRouteHistory] = useState(null);
  const [routeHistoryTests, setRouteHistoryTests] = useState([]);
  const [routeHistoryLoading, setRouteHistoryLoading] = useState(false);
  const [routeHistoryGrouping, setRouteHistoryGrouping] = useState('sample');
  const [routeDistanceTracePoints, setRouteDistanceTracePoints] = useState([]);
  const [routeDistanceTraceMeta, setRouteDistanceTraceMeta] = useState(null);
  const [routeDistanceTraceLoading, setRouteDistanceTraceLoading] = useState(false);
  const [routeActiveFault, setRouteActiveFault] = useState(null);
  const [selectedTopologyRtuId, setSelectedTopologyRtuId] = useState('');

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
        loadAvailabilityHistory();
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
      loadAvailabilityHistory();
      loadAlarmStatistics();
      loadActiveAlarms();
      loadRoutes();
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
        loadAvailabilityHistory(),
        loadActiveAlarms(),
        loadAlarmStatistics(),
        loadRoutes(),
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

  const loadAvailabilityHistory = async () => {
    try {
      const response = await kpisAPI.getHistory({
        kpiType: 'NETWORK_HEALTH',
        period: 'REALTIME',
        hours: 24 * 14,
      });
      setAvailabilityHistory(normalizeList(response.data));
    } catch (error) {
      console.error('Error loading availability history:', error);
      setAvailabilityHistory([]);
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

  const normalizeList = (payload) => (Array.isArray(payload) ? payload : payload?.value || []);

  const loadSelectedRtuHealth = async (rtuId) => {
    if (!rtuId) {
      setSelectedRtuHealth(null);
      return;
    }

    setSelectedRtuHealthLoading(true);
    try {
      // Fetch a larger window and use the most recent sample that actually carries RTU health values.
      const response = await otdrAPI.getRecent(100, undefined, rtuId);
      const tests = normalizeList(response.data);
      const latestHealthTest = tests.find((test) => extractRtuHealth(test));

      if (latestHealthTest) {
        const normalizedHealth = extractRtuHealth(latestHealthTest);
        setSelectedRtuHealth({
          ...normalizedHealth,
          measuredAt: latestHealthTest.measuredAt || latestHealthTest.measured_at,
          routeId: latestHealthTest.routeId || latestHealthTest.route_id,
        });
      } else {
        setSelectedRtuHealth(null);
      }
    } catch (error) {
      console.error(`Error loading latest OTDR health for RTU ${rtuId}:`, error);
      setSelectedRtuHealth(null);
    } finally {
      setSelectedRtuHealthLoading(false);
    }
  };

  const loadRoutes = async () => {
    try {
      const response = await routesAPI.getAll();
      const allRoutes = normalizeList(response.data);
      setRoutes(allRoutes);

      const uniqueRtuIds = [...new Set(allRoutes.map((route) => route.rtuId).filter(Boolean))].sort();
      const dbRtus = uniqueRtuIds.map((rtuId) => ({
        rtuId,
        routesCount: allRoutes.filter((route) => route.rtuId === rtuId).length,
      }));
      setRtus(dbRtus);

      const preferredRtuId = selectedRtuId && uniqueRtuIds.includes(selectedRtuId)
        ? selectedRtuId
        : uniqueRtuIds[0] || '';

      if (preferredRtuId) {
        if (preferredRtuId !== selectedRtuId) {
          setSelectedRtuId(preferredRtuId);
        }
        await loadSelectedRtuHealth(preferredRtuId);
      } else {
        setSelectedRtuId('');
        setSelectedRtuHealth(null);
      }
    } catch (error) {
      console.error('Error loading routes:', error);
      setRoutes([]);
      setRtus([]);
      setSelectedRtuHealth(null);
    }
  };

  const loadRecentTests = async () => {
    try {
      const response = await otdrAPI.getRecent(15);
      setRecentTests(normalizeList(response.data));
    } catch (error) {
      console.error('Error loading OTDR tests:', error);
      setRecentTests([]);
    }
  };

  const fetchRouteDistanceProfile = async (route) => {
    const traceResponse = await rtusAPI.getRouteTraceReference(route.rtuId, route.routeId, 1800);
    const alarmsResponse = await alarmsAPI.getByRoute(route.routeId);

    const tracePayload = traceResponse?.data || {};
    const referencePoints = Array.isArray(tracePayload.points) ? tracePayload.points : [];
    const routeAlarms = normalizeList(alarmsResponse?.data);

    return {
      referencePoints,
      traceMeta: {
        measurementReferenceFile: tracePayload.measurement_reference_file || tracePayload.measurementReferenceFile || null,
        pointCount: Number(tracePayload.point_count || referencePoints.length || 0),
        totalPoints: Number(tracePayload.total_points || referencePoints.length || 0),
      },
      activeFault: extractActiveRouteFault(routeAlarms),
    };
  };

  const openRouteHistory = async (route) => {
    setSelectedRouteHistory(route);
    setRouteHistoryLoading(true);
    setRouteHistoryTests([]);
    setRouteHistoryGrouping('sample');
    setRouteDistanceTraceLoading(true);
    setRouteDistanceTracePoints([]);
    setRouteDistanceTraceMeta(null);
    setRouteActiveFault(null);

    try {
      const [testsResponse, distanceProfile] = await Promise.all([
        otdrAPI.getRecent(300, route.routeId, route.rtuId),
        fetchRouteDistanceProfile(route),
      ]);

      setRouteHistoryTests(normalizeList(testsResponse.data));
      setRouteDistanceTracePoints(distanceProfile.referencePoints);
      setRouteDistanceTraceMeta(distanceProfile.traceMeta);
      setRouteActiveFault(distanceProfile.activeFault);
    } catch (error) {
      console.error(`Error loading OTDR history for route ${route.routeId}:`, error);
      setRouteHistoryTests([]);
      setRouteDistanceTracePoints([]);
      setRouteDistanceTraceMeta(null);
      setRouteActiveFault(null);
    } finally {
      setRouteHistoryLoading(false);
      setRouteDistanceTraceLoading(false);
    }
  };

  const closeRouteHistory = () => {
    setSelectedRouteHistory(null);
    setRouteHistoryTests([]);
    setRouteHistoryLoading(false);
    setRouteHistoryGrouping('sample');
    setRouteDistanceTracePoints([]);
    setRouteDistanceTraceMeta(null);
    setRouteDistanceTraceLoading(false);
    setRouteActiveFault(null);
  };

  useEffect(() => {
    if (!selectedRouteHistory?.routeId || !selectedRouteHistory?.rtuId) {
      return undefined;
    }

    let cancelled = false;

    const refreshDistanceProfile = async () => {
      try {
        const distanceProfile = await fetchRouteDistanceProfile(selectedRouteHistory);

        if (cancelled) {
          return;
        }

        setRouteDistanceTracePoints(distanceProfile.referencePoints);
        setRouteDistanceTraceMeta(distanceProfile.traceMeta);
        setRouteActiveFault(distanceProfile.activeFault);
      } catch (error) {
        if (!cancelled) {
          console.error(`Error refreshing distance profile for route ${selectedRouteHistory.routeId}:`, error);
        }
      }
    };

    const intervalId = setInterval(refreshDistanceProfile, 8000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [selectedRouteHistory]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="mx-auto mb-5 flex w-20 items-center justify-between">
            <span className="h-3 w-3 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '0ms' }} />
            <span className="h-3 w-3 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '160ms' }} />
            <span className="h-3 w-3 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '320ms' }} />
          </div>
          <p className="text-3xl font-bold tracking-tight text-slate-800">FiberMaster</p>
          <p className="mt-2 text-sm text-slate-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const toNumericCoordinate = (value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  };

  const topologyRtuSource = topologyData?.rtus || [];
  const topologyRouteSource = topologyData?.routes || [];

  const topologyCoordinatePoints = [
    ...topologyRtuSource.map((rtu) => ({
      lat: toNumericCoordinate(rtu.lat),
      lng: toNumericCoordinate(rtu.lng),
    })),
    ...topologyRouteSource.map((route) => ({
      lat: toNumericCoordinate(route.lat),
      lng: toNumericCoordinate(route.lng),
    })),
  ].filter((point) => point.lat !== null && point.lng !== null);

  const hasTopologyCoordinates = topologyCoordinatePoints.length > 0;
  const topologyLatMin = hasTopologyCoordinates
    ? Math.min(...topologyCoordinatePoints.map((point) => point.lat))
    : 0;
  const topologyLatMax = hasTopologyCoordinates
    ? Math.max(...topologyCoordinatePoints.map((point) => point.lat))
    : 1;
  const topologyLngMin = hasTopologyCoordinates
    ? Math.min(...topologyCoordinatePoints.map((point) => point.lng))
    : 0;
  const topologyLngMax = hasTopologyCoordinates
    ? Math.max(...topologyCoordinatePoints.map((point) => point.lng))
    : 1;

  const projectTopologyPoint = (latValue, lngValue) => {
    const lat = toNumericCoordinate(latValue);
    const lng = toNumericCoordinate(lngValue);

    if (lat === null || lng === null || !hasTopologyCoordinates) {
      return { x: 50, y: 50 };
    }

    const latitudeRange = topologyLatMax - topologyLatMin || 1;
    const longitudeRange = topologyLngMax - topologyLngMin || 1;
    const horizontalPadding = 8;
    const verticalPadding = 10;

    const normalizedX = (lng - topologyLngMin) / longitudeRange;
    const normalizedY = (topologyLatMax - lat) / latitudeRange;

    return {
      x: horizontalPadding + (normalizedX * (100 - (2 * horizontalPadding))),
      y: verticalPadding + (normalizedY * (100 - (2 * verticalPadding))),
    };
  };

  const topologyRtus = topologyRtuSource.map((rtu, index) => {
    const rtuPosition = projectTopologyPoint(rtu.lat, rtu.lng);
    const rtuRoutes = topologyRouteSource
      .filter((route) => route.rtuId === rtu.id)
      .map((route) => ({
        id: route.id,
        distanceKm: Number(route.distanceKm) || 0,
        lat: toNumericCoordinate(route.lat),
        lng: toNumericCoordinate(route.lng),
        position: projectTopologyPoint(route.lat, route.lng),
      }));

    return {
      id: rtu.id,
      name: rtu.name || rtu.id,
      city: rtu.city || 'Unknown',
      color: rtu.color || TOPOLOGY_COLORS[index % TOPOLOGY_COLORS.length],
      lat: toNumericCoordinate(rtu.lat),
      lng: toNumericCoordinate(rtu.lng),
      position: rtuPosition,
      routes: rtuRoutes,
    };
  });

  const totalTopologyRoutes = topologyRouteSource.length;
  const selectedTopologyRtu = topologyRtus.find((rtu) => rtu.id === selectedTopologyRtuId) || topologyRtus[0] || null;
  const selectedTopologyRoutes = selectedTopologyRtu?.routes || [];
  const selectedRtuRoutes = routes
    .filter((route) => route.rtuId === selectedRtuId)
    .map((route) => ({
      routeId: route.routeId,
      status: route.status,
      fiberLengthKm: route?.fiberSpec?.lengthKm,
      activeAlarms: route?.currentCondition?.activeAlarms ?? 0,
    }));
  const latestRtuHealthMeasuredAt = parseTimestamp(selectedRtuHealth?.measuredAt);
  const latestRtuHealthMeasuredAtText = latestRtuHealthMeasuredAt
    ? latestRtuHealthMeasuredAt.toLocaleString()
    : 'No telemetry yet';
  const powerSupplyState = selectedRtuHealth?.powerSupplyStatus || null;
  const powerSupplyIsNormal = typeof powerSupplyState === 'string'
    ? powerSupplyState.toUpperCase() === 'NORMAL'
    : false;
  const routeHistorySeriesSource = [...routeHistoryTests]
    .sort((a, b) => {
      const aTime = parseTimestamp(a.measuredAt)?.getTime() || 0;
      const bTime = parseTimestamp(b.measuredAt)?.getTime() || 0;
      return aTime - bTime;
    })
    .map((test, index) => {
      const measuredAt = parseTimestamp(test.measuredAt);
      const year = measuredAt ? measuredAt.getFullYear() : null;
      const month = measuredAt ? String(measuredAt.getMonth() + 1).padStart(2, '0') : null;
      const day = measuredAt ? String(measuredAt.getDate()).padStart(2, '0') : null;

      return {
        sampleIndex: index + 1,
        measuredAtMs: measuredAt?.getTime() || 0,
        timestampText: measuredAt ? measuredAt.toLocaleString() : '-',
        timeLabel: measuredAt
          ? measuredAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : `T${index + 1}`,
        dayKey: measuredAt ? `${year}-${month}-${day}` : `day-${index + 1}`,
        monthKey: measuredAt ? `${year}-${month}` : `month-${index + 1}`,
        power: typeof test.averagePowerDb === 'number' ? Number(test.averagePowerDb.toFixed(3)) : null,
        variation: typeof test.powerVariationDb === 'number'
          ? Number(test.powerVariationDb.toFixed(3))
          : null,
      };
    })
    .filter((sample) => sample.power !== null || sample.variation !== null);

  const aggregateRouteHistorySeries = (series, keyField) => {
    const buckets = new Map();

    series.forEach((sample) => {
      const key = sample[keyField];
      if (!buckets.has(key)) {
        buckets.set(key, {
          label: key,
          powerSum: 0,
          powerCount: 0,
          variationSum: 0,
          variationCount: 0,
          lastTimestamp: sample.measuredAtMs,
        });
      }

      const bucket = buckets.get(key);
      bucket.lastTimestamp = Math.max(bucket.lastTimestamp, sample.measuredAtMs);

      if (sample.power !== null) {
        bucket.powerSum += sample.power;
        bucket.powerCount += 1;
      }

      if (sample.variation !== null) {
        bucket.variationSum += sample.variation;
        bucket.variationCount += 1;
      }
    });

    return [...buckets.values()]
      .sort((a, b) => a.lastTimestamp - b.lastTimestamp)
      .map((bucket, index) => ({
        index: index + 1,
        label: bucket.label,
        timestampText: '-',
        power: bucket.powerCount > 0
          ? Number((bucket.powerSum / bucket.powerCount).toFixed(3))
          : null,
        variation: bucket.variationCount > 0
          ? Number((bucket.variationSum / bucket.variationCount).toFixed(3))
          : null,
      }));
  };

  const routePowerHistoryData = routeHistoryGrouping === 'day'
    ? aggregateRouteHistorySeries(routeHistorySeriesSource, 'dayKey')
    : routeHistoryGrouping === 'month'
      ? aggregateRouteHistorySeries(routeHistorySeriesSource, 'monthKey')
      : routeHistorySeriesSource.map((sample) => ({
          index: sample.sampleIndex,
          label: sample.timeLabel,
          timestampText: sample.timestampText,
          power: sample.power,
          variation: sample.variation,
        }));

  const routeDistanceChartData = buildDistanceProfileSeries(routeDistanceTracePoints, routeActiveFault);
  const hasRouteDistanceFaultEffect = Number.isFinite(routeActiveFault?.faultDistanceKm)
    && Number.isFinite(routeActiveFault?.attenuationDb)
    && routeActiveFault.attenuationDb > 0;

  const routeHistoryTableData = [...routeHistoryTests].sort((a, b) => {
    const aTime = parseTimestamp(a.measuredAt)?.getTime() || 0;
    const bTime = parseTimestamp(b.measuredAt)?.getTime() || 0;
    return bTime - aTime;
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="space-y-6 px-3 py-4 sm:px-5 lg:px-8">
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
            <AvailabilityRangeChart history={availabilityHistory} />

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
                  <div className="space-y-3">
                    <AlarmSeverityBar label="Critical" count={stats.critical} color="text-white" bgColor="bg-red-600" />
                    <AlarmSeverityBar label="High" count={stats.high} color="text-white" bgColor="bg-orange-600" />
                    <AlarmSeverityBar label="Medium" count={stats.medium} color="text-white" bgColor="bg-yellow-600" />
                    <AlarmSeverityBar label="Low" count={stats.low} color="text-white" bgColor="bg-blue-600" />
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
                  {routes.map((route) => {
                    return (
                      <button
                        type="button"
                        key={route.routeId}
                        onClick={() => openRouteHistory(route)}
                        className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-indigo-50 p-4 shadow-sm text-left transition-all hover:shadow-md hover:border-indigo-300"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-indigo-600">{route.routeId}</p>
                            <p className="text-sm font-bold text-slate-900 mt-1">{route.routeName}</p>
                            <p className="text-xs text-slate-500 mt-1">{route.region} • {route?.fiberSpec?.lengthKm ?? '-'} km</p>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="inline-flex rounded-full bg-slate-900/5 px-2.5 py-1 text-xs font-medium text-slate-700">
                            Status: {route.status}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                            <History className="w-3 h-3" /> History
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedRouteHistory && (
              <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-6xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                  <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-bold text-slate-900">Route OTDR History</h4>
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
                      <p className="text-sm text-slate-600">Loading route history...</p>
                    ) : (
                      <div className="space-y-6">
                        <div className="rounded-xl border border-cyan-100 bg-cyan-50/35 p-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h5 className="text-sm font-bold text-cyan-900">Power vs Distance (trace.dat reference)</h5>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-semibold text-cyan-800">
                                {routeDistanceTraceMeta?.pointCount ?? 0} points
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  hasRouteDistanceFaultEffect
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {hasRouteDistanceFaultEffect ? 'Fault profile active' : 'Reference profile'}
                              </span>
                            </div>
                          </div>

                          <p className="mb-3 text-xs text-slate-600">
                            File: {routeDistanceTraceMeta?.measurementReferenceFile || 'trace.dat not found for this route'}
                          </p>

                          {routeDistanceTraceLoading ? (
                            <p className="text-sm text-slate-600">Loading distance profile...</p>
                          ) : routeDistanceChartData.length === 0 ? (
                            <p className="text-sm text-slate-600">No trace.dat points available for this route.</p>
                          ) : (
                            <div className="h-72">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                  data={routeDistanceChartData}
                                  margin={{ top: 10, right: 14, left: 4, bottom: 8 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                                  <XAxis
                                    type="number"
                                    dataKey="distanceKm"
                                    domain={['dataMin', 'dataMax']}
                                    stroke="#0f766e"
                                    tick={{ fontSize: 12 }}
                                    tickFormatter={(value) => `${Number(value).toFixed(1)} km`}
                                  />
                                  <YAxis
                                    stroke="#0f766e"
                                    tick={{ fontSize: 12 }}
                                    tickFormatter={(value) => `${Number(value).toFixed(1)}`}
                                    label={{ value: 'Power (dB)', angle: -90, position: 'insideLeft' }}
                                  />
                                  <Tooltip
                                    labelFormatter={(value) => `Distance: ${Number(value).toFixed(3)} km`}
                                    formatter={(value, key) => {
                                      const label = key === 'referencePowerDb'
                                        ? 'Reference'
                                        : 'Current';
                                      return [`${Number(value).toFixed(3)} dB`, label];
                                    }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="referencePowerDb"
                                    stroke="#64748b"
                                    strokeWidth={1.8}
                                    strokeDasharray="5 4"
                                    dot={false}
                                    connectNulls
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="currentPowerDb"
                                    stroke={hasRouteDistanceFaultEffect ? '#dc2626' : '#0ea5e9'}
                                    strokeWidth={2.5}
                                    dot={false}
                                    connectNulls
                                  />
                                  {Number.isFinite(routeActiveFault?.faultDistanceKm) && (
                                    <ReferenceLine
                                      x={routeActiveFault.faultDistanceKm}
                                      stroke="#dc2626"
                                      strokeDasharray="4 4"
                                      label={{ value: 'Fault point', fill: '#b91c1c', fontSize: 11, position: 'insideTopRight' }}
                                    />
                                  )}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )}

                          {hasRouteDistanceFaultEffect ? (
                            <p className="mt-3 text-xs text-red-700">
                              Active alarm {routeActiveFault?.status || ''}: points after {Number(routeActiveFault.faultDistanceKm).toFixed(2)} km are reduced by {Number(routeActiveFault.attenuationDb).toFixed(2)} dB.
                            </p>
                          ) : (
                            <p className="mt-3 text-xs text-emerald-700">
                              No active route fault. Displaying pure trace.dat reference profile.
                            </p>
                          )}
                        </div>

                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <h5 className="text-sm font-bold text-indigo-900">Power (dB)</h5>
                            <div className="flex items-center gap-2">
                              <label htmlFor="routeHistoryGrouping" className="text-xs font-semibold text-indigo-800">Filter</label>
                              <select
                                id="routeHistoryGrouping"
                                className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs font-medium text-indigo-800"
                                value={routeHistoryGrouping}
                                onChange={(event) => setRouteHistoryGrouping(event.target.value)}
                              >
                                <option value="sample">By test</option>
                                <option value="day">By day</option>
                                <option value="month">By month</option>
                              </select>
                              <span className="text-xs font-medium text-indigo-700">{routeHistoryTests.length} tests</span>
                            </div>
                          </div>

                          {routePowerHistoryData.length === 0 ? (
                            <p className="text-sm text-slate-600">No OTDR power history available for this route yet.</p>
                          ) : (
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={routePowerHistoryData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                                  <XAxis dataKey="label" stroke="#475569" tick={{ fontSize: 12 }} />
                                  <YAxis
                                    stroke="#1d4ed8"
                                    tick={{ fontSize: 12 }}
                                    domain={['auto', 'auto']}
                                    label={{ value: 'dB', angle: -90, position: 'insideLeft' }}
                                  />
                                  <Tooltip
                                    labelFormatter={(label, payload) => {
                                      const timestampText = payload?.[0]?.payload?.timestampText;
                                      return timestampText && timestampText !== '-'
                                        ? `${label} (${timestampText})`
                                        : label;
                                    }}
                                    formatter={(value) => {
                                      if (value === null || value === undefined) {
                                        return ['N/A', 'Power'];
                                      }
                                      return [`${Number(value).toFixed(3)} dB`, 'Power'];
                                    }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="power"
                                    stroke="#1d4ed8"
                                    strokeWidth={2.5}
                                    dot={{ r: 3, fill: '#1d4ed8' }}
                                    activeDot={{ r: 5 }}
                                    connectNulls
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <h5 className="text-sm font-bold text-slate-900">Test History</h5>
                            <span className="text-xs font-medium text-slate-600">Newest first</span>
                          </div>

                          {routeHistoryTableData.length === 0 ? (
                            <p className="text-sm text-slate-600">No OTDR tests found for this route.</p>
                          ) : (
                            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                              <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-left text-slate-500">
                                  <tr>
                                    <th className="px-3 py-2">Time</th>
                                    <th className="px-3 py-2">Mode</th>
                                    <th className="px-3 py-2">Wavelength</th>
                                    <th className="px-3 py-2">Power</th>
                                    <th className="px-3 py-2">Variation</th>
                                    <th className="px-3 py-2">Result</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {routeHistoryTableData.map((test, index) => {
                                    const measuredAt = parseTimestamp(test.measuredAt);
                                    return (
                                      <tr key={test.id || `${selectedRouteHistory.routeId}-${test.measuredAt || index}-${index}`} className="border-t border-slate-100">
                                        <td className="px-3 py-2 text-slate-700">{measuredAt ? measuredAt.toLocaleString() : '-'}</td>
                                        <td className="px-3 py-2 text-slate-600">{test.testMode || '-'}</td>
                                        <td className="px-3 py-2 text-slate-600">{test.wavelengthNm != null ? `${test.wavelengthNm} nm` : '-'}</td>
                                        <td className="px-3 py-2 text-slate-700">
                                          {typeof test.averagePowerDb === 'number' ? `${Number(test.averagePowerDb).toFixed(3)} dB` : '-'}
                                        </td>
                                        <td className="px-3 py-2 text-slate-700">
                                          {typeof test.powerVariationDb === 'number' ? `${Number(test.powerVariationDb).toFixed(3)} dB` : '-'}
                                        </td>
                                        <td className="px-3 py-2">
                                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${test.testResult === 'Pass' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                            {test.testResult || '-'}
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

                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="card shadow-lg">
              <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <span>Active Alarms ({alarms.length})</span>
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
                      await loadSelectedRtuHealth(nextRtuId);
                    }}
                  >
                    {rtus.length === 0 && <option value="">No RTUs available</option>}
                    {rtus.map((item) => (
                      <option key={item.rtuId} value={item.rtuId}>{item.rtuId}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <RtuHealthGaugeCard
                title="Temperature"
                value={selectedRtuHealth?.temperatureC}
                unit="°C"
                maxValue={80}
                precision={1}
                loading={selectedRtuHealthLoading}
                palette="amber"
              />
              <RtuHealthGaugeCard
                title="CPU Usage"
                value={selectedRtuHealth?.cpuUsagePercent}
                unit="%"
                maxValue={100}
                precision={1}
                loading={selectedRtuHealthLoading}
                palette="cyan"
              />
              <RtuHealthGaugeCard
                title="Memory Usage"
                value={selectedRtuHealth?.memoryUsagePercent}
                unit="%"
                maxValue={100}
                precision={1}
                loading={selectedRtuHealthLoading}
                palette="violet"
              />
            </div>

            <div
              className={`rounded-3xl border-2 border-slate-900/90 p-5 shadow-[0_14px_35px_-22px_rgba(15,23,42,0.7)] bg-gradient-to-br ${
                powerSupplyIsNormal
                  ? 'from-emerald-50 via-white to-emerald-100'
                  : 'from-rose-50 via-white to-rose-100'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Power Supply</p>
                  <p className={`mt-1 text-3xl font-bold ${powerSupplyIsNormal ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {selectedRtuHealthLoading ? 'Loading...' : (powerSupplyState || 'N/A')}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    RTU {selectedRtuId || '-'}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3 shadow-inner">
                  <div className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${powerSupplyIsNormal ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Live status</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Last sample: {latestRtuHealthMeasuredAtText}</p>
                  <p className="mt-1 text-xs text-slate-500">Source route: {selectedRtuHealth?.routeId || '-'}</p>
                </div>
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
                        <tr key={route.routeId} className="border-b border-slate-100">
                          <td className="py-2 pr-3 font-medium text-slate-700">{route.routeId}</td>
                          <td className="py-2 pr-3 text-slate-600">{route.status || 'UNKNOWN'}</td>
                          <td className="py-2 pr-3 text-slate-600">{route.fiberLengthKm ?? '-'} km</td>
                          <td className="py-2 text-slate-600">{route.activeAlarms ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
                    {topologyRtus.length} RTUs
                  </span>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                    {totalTopologyRoutes} Fiber Routes
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                    {topologyRtus.length === 0 ? (
                      <div className="flex h-[420px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-600">
                        No topology coordinates found.
                      </div>
                    ) : (
                      <div className="relative h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-cyan-50 via-white to-blue-100">
                        <div className="absolute inset-0 opacity-60" style={{
                          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(30, 41, 59, 0.15) 1px, transparent 0)',
                          backgroundSize: '22px 22px',
                        }} />

                        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <defs>
                            <marker id="route-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                              <path d="M0,0 L6,3 L0,6 z" fill={selectedTopologyRtu?.color || '#2563eb'} />
                            </marker>
                          </defs>

                          {selectedTopologyRtu && selectedTopologyRoutes.map((route) => (
                            <g key={`line-${selectedTopologyRtu.id}-${route.id}`}>
                              <line
                                x1={selectedTopologyRtu.position.x}
                                y1={selectedTopologyRtu.position.y}
                                x2={route.position.x}
                                y2={route.position.y}
                                stroke={selectedTopologyRtu.color}
                                strokeWidth="0.55"
                                strokeDasharray="2 1.5"
                                markerEnd="url(#route-arrow)"
                                opacity="0.75"
                              />
                              <circle
                                cx={route.position.x}
                                cy={route.position.y}
                                r="0.95"
                                fill={selectedTopologyRtu.color}
                                opacity="0.95"
                              />
                            </g>
                          ))}
                        </svg>

                        {topologyRtus.map((rtu) => {
                          const isActive = selectedTopologyRtu?.id === rtu.id;

                          return (
                            <button
                              key={rtu.id}
                              type="button"
                              onClick={() => setSelectedTopologyRtuId(rtu.id)}
                              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 px-2.5 py-1.5 text-left transition-all ${
                                isActive
                                  ? 'scale-105 bg-slate-900 text-white shadow-xl'
                                  : 'bg-white/95 text-slate-800 shadow-md hover:scale-105 hover:bg-white'
                              }`}
                              style={{
                                left: `${rtu.position.x}%`,
                                top: `${rtu.position.y}%`,
                                borderColor: rtu.color,
                                boxShadow: isActive ? `0 0 0 4px ${rtu.color}33` : undefined,
                              }}
                            >
                              <p className="text-[11px] font-bold leading-tight">{rtu.id}</p>
                              <p className={`text-[10px] leading-tight ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>{rtu.city}</p>
                            </button>
                          );
                        })}

                        <div className="absolute left-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm">
                          Click an RTU node to display its routes
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-900">Selected RTU</h4>
                    {!selectedTopologyRtu ? (
                      <p className="mt-2 text-sm text-slate-600">No RTU available in topology data.</p>
                    ) : (
                      <>
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs font-semibold text-slate-500">Node</p>
                          <p className="text-sm font-bold text-slate-900 mt-1">{selectedTopologyRtu.id}</p>
                          <p className="text-xs text-slate-600 mt-1">{selectedTopologyRtu.city}</p>
                          <p className="text-xs text-slate-600 mt-1">{selectedTopologyRtu.routes.length} routes</p>
                          <p className="text-[11px] text-slate-500 mt-2">
                            Lat: {selectedTopologyRtu.lat != null ? selectedTopologyRtu.lat.toFixed(4) : '-'} | Lng: {selectedTopologyRtu.lng != null ? selectedTopologyRtu.lng.toFixed(4) : '-'}
                          </p>
                        </div>

                        <div className="mt-4">
                          <p className="text-xs font-semibold text-slate-500 mb-2">Routes</p>
                          {selectedTopologyRoutes.length === 0 ? (
                            <p className="text-sm text-slate-600">No routes linked to this RTU.</p>
                          ) : (
                            <div className="max-h-[260px] space-y-2 overflow-auto pr-1">
                              {selectedTopologyRoutes.map((route) => (
                                <div key={`${selectedTopologyRtu.id}-${route.id}`} className="rounded-lg border border-slate-200 bg-white p-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-bold text-slate-800">{route.id}</p>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                      {route.distanceKm} km
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="card shadow-lg">
                <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-cyan-600" />
                  <span>OTDR Tests</span>
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

function AlarmSeverityBar({ label, count, color, bgColor }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <span className={`${bgColor} ${color} px-4 py-2 rounded-full text-lg font-bold shadow-md`}>
        {count || 0}
      </span>
    </div>
  );
}

function RtuHealthGaugeCard({
  title,
  value,
  unit,
  maxValue,
  precision = 1,
  loading,
  palette = 'amber',
}) {
  const themes = {
    amber: {
      cardBg: 'from-amber-50 via-orange-50 to-amber-100',
      valueText: 'text-orange-700',
      gaugeTrack: '#fcd9b1',
      gaugeFill: '#f97316',
      needle: '#c2410c',
      badgeText: 'text-orange-700',
    },
    cyan: {
      cardBg: 'from-cyan-50 via-sky-50 to-cyan-100',
      valueText: 'text-sky-700',
      gaugeTrack: '#c7e9ff',
      gaugeFill: '#0ea5e9',
      needle: '#0369a1',
      badgeText: 'text-sky-700',
    },
    violet: {
      cardBg: 'from-violet-50 via-purple-50 to-violet-100',
      valueText: 'text-purple-700',
      gaugeTrack: '#e6d5ff',
      gaugeFill: '#a855f7',
      needle: '#7e22ce',
      badgeText: 'text-purple-700',
    },
  };

  const theme = themes[palette] || themes.amber;
  const numericValue = Number(value);
  const hasValue = Number.isFinite(numericValue);
  const progressPercent = hasValue
    ? Math.max(0, Math.min(100, (numericValue / Math.max(1, maxValue)) * 100))
    : 0;

  const circumference = Math.PI * 45;
  const dashOffset = circumference * (1 - (progressPercent / 100));
  const angle = Math.PI - ((Math.PI * progressPercent) / 100);
  const needleX = 60 + (35 * Math.cos(angle));
  const needleY = 60 - (35 * Math.sin(angle));

  const formattedValue = loading
    ? 'Loading...'
    : hasValue
      ? `${numericValue.toFixed(precision)}${unit}`
      : 'N/A';

  return (
    <div className={`relative overflow-hidden rounded-3xl border-2 border-slate-900/90 bg-gradient-to-br ${theme.cardBg} p-5 shadow-[0_14px_35px_-22px_rgba(15,23,42,0.7)]`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-600">{title}</p>
        <span className={`rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-xs font-bold ${theme.badgeText}`}>
          {loading ? '...' : `${progressPercent.toFixed(0)}%`}
        </span>
      </div>

      <p className={`text-4xl font-bold tracking-tight ${theme.valueText}`}>{formattedValue}</p>

      <div className="mt-3 h-24 rounded-2xl border border-white/70 bg-white/65 p-2 shadow-inner">
        <svg viewBox="0 0 120 70" className="h-full w-full">
          <path
            d="M 15 60 A 45 45 0 0 1 105 60"
            fill="none"
            stroke={theme.gaugeTrack}
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 15 60 A 45 45 0 0 1 105 60"
            fill="none"
            stroke={theme.gaugeFill}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
          />

          {hasValue && !loading && (
            <>
              <line x1="60" y1="60" x2={needleX} y2={needleY} stroke={theme.needle} strokeWidth="3" strokeLinecap="round" />
              <circle cx="60" cy="60" r="4.5" fill={theme.needle} />
            </>
          )}
        </svg>
      </div>

    </div>
  );
}

export default Dashboard;
