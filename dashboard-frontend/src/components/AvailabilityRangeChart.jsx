import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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

const formatDayLabel = (dayDate) => (
  dayDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
);

const TREND_RANGE_OPTIONS = [
  { key: '24h', label: '24H', hours: 24 },
  { key: '7d', label: '7D', hours: 24 * 7 },
  { key: '30d', label: '30D', hours: 24 * 30 },
  { key: '90d', label: '90D', hours: 24 * 90 },
  { key: '1y', label: '1Y', hours: 24 * 365 },
  { key: 'all', label: 'Since Start', hours: null },
];

const toDailyAvailabilityRange = (history) => {
  const dailyBuckets = new Map();

  history.forEach((entry) => {
    const value = Number(entry?.metrics?.networkAvailabilityPercent);
    const timestamp = parseTimestamp(entry?.timestamp ?? entry?.calculatedAt);

    if (!Number.isFinite(value) || !timestamp) {
      return;
    }

    const dayKey = timestamp.toISOString().slice(0, 10);
    const dayStart = new Date(timestamp);
    dayStart.setHours(0, 0, 0, 0);

    const existingBucket = dailyBuckets.get(dayKey);
    if (!existingBucket) {
      dailyBuckets.set(dayKey, {
        dayKey,
        dayDate: dayStart,
        minAvailability: value,
        maxAvailability: value,
        samples: 1,
      });
      return;
    }

    existingBucket.minAvailability = Math.min(existingBucket.minAvailability, value);
    existingBucket.maxAvailability = Math.max(existingBucket.maxAvailability, value);
    existingBucket.samples += 1;
  });

  return [...dailyBuckets.values()]
    .sort((a, b) => a.dayDate - b.dayDate)
    .slice(-10)
    .map((bucket) => ({
      dayKey: bucket.dayKey,
      label: formatDayLabel(bucket.dayDate),
      minAvailability: Number(bucket.minAvailability.toFixed(2)),
      maxAvailability: Number(bucket.maxAvailability.toFixed(2)),
      samples: bucket.samples,
    }));
};

const toTrendSeries = (history) => history
  .map((entry) => {
    const value = Number(entry?.metrics?.networkAvailabilityPercent);
    const timestamp = parseTimestamp(entry?.timestamp ?? entry?.calculatedAt);

    if (!Number.isFinite(value) || !timestamp) {
      return null;
    }

    return {
      timestampMs: timestamp.getTime(),
      availability: Number(value.toFixed(3)),
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.timestampMs - b.timestampMs);

const filterTrendByRange = (points, rangeKey) => {
  if (!points.length || rangeKey === 'all') {
    return points;
  }

  const rangeOption = TREND_RANGE_OPTIONS.find((option) => option.key === rangeKey);
  if (!rangeOption || rangeOption.hours == null) {
    return points;
  }

  const lastTimestamp = points[points.length - 1].timestampMs;
  const startTimestamp = lastTimestamp - (rangeOption.hours * 60 * 60 * 1000);
  return points.filter((point) => point.timestampMs >= startTimestamp);
};

const downsampleTrendPoints = (points, maxPoints = 420) => {
  if (points.length <= maxPoints) {
    return points;
  }

  const bucketSize = Math.ceil(points.length / maxPoints);
  return points.filter((_, index) => index % bucketSize === 0 || index === points.length - 1);
};

const formatTrendTick = (timestampMs, rangeKey, spanMs = 0) => {
  const date = new Date(timestampMs);

  if (rangeKey === '24h' || spanMs <= (48 * 60 * 60 * 1000)) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  if (rangeKey === '7d' || spanMs <= (45 * 24 * 60 * 60 * 1000)) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  if (rangeKey === '30d' || rangeKey === '90d' || spanMs <= (400 * 24 * 60 * 60 * 1000)) {
    return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }

  return date.toLocaleDateString(undefined, { year: 'numeric' });
};

const TrendTooltip = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const datum = payload[0]?.payload;
  const timestamp = datum?.timestampMs ? new Date(datum.timestampMs) : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Snapshot</p>
      <p className="mt-1 text-sm font-medium text-slate-700">
        {timestamp
          ? timestamp.toLocaleString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-'}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-700">
        Availability: <span className="font-bold text-blue-700">{datum?.availability?.toFixed(2)}%</span>
      </p>
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const datum = payload[0]?.payload;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-700">
        Daily Low: <span className="font-bold text-blue-600">{datum?.minAvailability?.toFixed(2)}%</span>
      </p>
      <p className="text-sm font-medium text-slate-700">
        Daily High: <span className="font-bold text-indigo-600">{datum?.maxAvailability?.toFixed(2)}%</span>
      </p>
    </div>
  );
};

function AvailabilityRangeChart({ history = [] }) {
  const [viewMode, setViewMode] = useState('trend');
  const [selectedTrendRange, setSelectedTrendRange] = useState('all');

  const chartData = useMemo(() => toDailyAvailabilityRange(history), [history]);
  const trendSeriesRaw = useMemo(() => toTrendSeries(history), [history]);
  const trendSeriesFiltered = useMemo(
    () => filterTrendByRange(trendSeriesRaw, selectedTrendRange),
    [trendSeriesRaw, selectedTrendRange],
  );
  const trendSeries = useMemo(
    () => downsampleTrendPoints(trendSeriesFiltered),
    [trendSeriesFiltered],
  );

  const allMinValues = chartData.map((item) => item.minAvailability);
  const allMaxValues = chartData.map((item) => item.maxAvailability);
  const trendValues = trendSeries.map((item) => item.availability);

  const lowerBound = chartData.length > 0
    ? Math.max(0, Math.floor((Math.min(...allMinValues) - 1.5) / 2) * 2)
    : 0;
  const upperBound = chartData.length > 0
    ? Math.min(100, Math.ceil((Math.max(...allMaxValues) + 1.5) / 2) * 2)
    : 100;

  const trendLowerBound = trendSeries.length > 0
    ? Math.max(0, Math.floor((Math.min(...trendValues) - 1) / 1) * 1)
    : 0;
  const trendUpperBound = trendSeries.length > 0
    ? Math.min(100, Math.ceil((Math.max(...trendValues) + 1) / 1) * 1)
    : 100;

  const trendSpanMs = trendSeriesFiltered.length > 1
    ? trendSeriesFiltered[trendSeriesFiltered.length - 1].timestampMs - trendSeriesFiltered[0].timestampMs
    : 0;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/70 p-5 shadow-2xl shadow-slate-400/45">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-sky-300/20 blur-2xl" />
      <div className="pointer-events-none absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-white/40 blur-2xl" />

      <div className="relative">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-blue-700 backdrop-blur-sm">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Performance Curve</p>
              <h3 className="text-xl font-bold tracking-tight text-slate-900">Availability</h3>
              <p className="mt-1 text-sm text-slate-500">
                Track historical availability as a smooth curve or switch to the daily range view.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white/80 p-1 shadow-sm backdrop-blur-sm">
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setViewMode('trend')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  viewMode === 'trend'
                    ? 'border border-blue-300 bg-blue-100/90 text-blue-800 shadow-sm'
                    : 'border border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-800'
                }`}
              >
                Trend Curve
              </button>
              <button
                type="button"
                onClick={() => setViewMode('envelope')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  viewMode === 'envelope'
                    ? 'border border-indigo-300 bg-indigo-100/90 text-indigo-800 shadow-sm'
                    : 'border border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-800'
                }`}
              >
                Daily Availability
              </button>
            </div>
          </div>
        </div>

        {viewMode === 'trend' && (
          <div className="mb-4 flex flex-wrap gap-2">
            {TREND_RANGE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSelectedTrendRange(option.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  selectedTrendRange === option.key
                    ? 'border-blue-300 bg-blue-100/90 text-blue-800 shadow-sm'
                    : 'border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:text-slate-800'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {viewMode === 'trend' && trendSeries.length === 0 ? (
          <div className="flex h-80 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 text-sm text-slate-500">
            No availability trend data yet.
          </div>
        ) : null}

        {viewMode === 'envelope' && chartData.length === 0 ? (
          <div className="flex h-80 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 text-sm text-slate-500">
            No availability history yet.
          </div>
        ) : null}

        {viewMode === 'trend' && trendSeries.length > 0 ? (
          <div className="h-80 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-inner shadow-slate-100/80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={trendSeries}
                margin={{ top: 8, right: 18, left: 0, bottom: 8 }}
              >
                <defs>
                  <linearGradient id="availabilityTrendLineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#0ea5e9" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                  <linearGradient id="availabilityTrendAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 6" stroke="#d1dae5" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="timestampMs"
                  domain={['dataMin', 'dataMax']}
                  tick={{ fill: '#334155', fontSize: 12, fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  tickMargin={10}
                  tickFormatter={(value) => formatTrendTick(value, selectedTrendRange, trendSpanMs)}
                />
                <YAxis
                  domain={[trendLowerBound, trendUpperBound]}
                  tick={{ fill: '#475569', fontSize: 12 }}
                  tickFormatter={(value) => `${value}%`}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={52}
                />
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#1e293b40', strokeWidth: 1 }} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="plainline"
                  wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingBottom: '10px' }}
                />
                <ReferenceLine
                  y={99}
                  stroke="#2563eb"
                  strokeDasharray="4 5"
                  ifOverflow="extendDomain"
                  label={{ value: 'SLA 99%', position: 'insideTopRight', fill: '#1d4ed8', fontSize: 11 }}
                />
                <Area
                  type="monotone"
                  dataKey="availability"
                  fill="url(#availabilityTrendAreaGradient)"
                  stroke="none"
                  legendType="none"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="availability"
                  name="Availability"
                  stroke="url(#availabilityTrendLineGradient)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 1, stroke: '#1e293b' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        {viewMode === 'envelope' && chartData.length > 0 ? (
          <div className="h-80 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-inner shadow-slate-100/80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 18, left: 0, bottom: 8 }}
                barCategoryGap="26%"
              >
                <defs>
                  <linearGradient id="availabilityDailyLowGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.78} />
                  </linearGradient>
                  <linearGradient id="availabilityDailyHighGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.96} />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity={0.8} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="4 6" stroke="#d1dae5" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#334155', fontSize: 12, fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                />
                <YAxis
                  domain={[lowerBound, upperBound]}
                  tick={{ fill: '#475569', fontSize: 12 }}
                  tickFormatter={(value) => `${value}%`}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1e293b10' }} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingBottom: '10px' }}
                />
                <ReferenceLine y={99} stroke="#2563eb" strokeDasharray="4 5" ifOverflow="extendDomain" />
                <Bar
                  dataKey="minAvailability"
                  name="Daily Low"
                  fill="url(#availabilityDailyLowGradient)"
                  radius={[10, 10, 0, 0]}
                  maxBarSize={24}
                />
                <Bar
                  dataKey="maxAvailability"
                  name="Daily High"
                  fill="url(#availabilityDailyHighGradient)"
                  radius={[10, 10, 0, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default AvailabilityRangeChart;