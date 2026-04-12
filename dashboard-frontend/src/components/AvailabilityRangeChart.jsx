import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
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

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const datum = payload[0]?.payload;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-700">
        Daily Low: <span className="font-bold text-amber-600">{datum?.minAvailability?.toFixed(2)}%</span>
      </p>
      <p className="text-sm font-medium text-slate-700">
        Daily High: <span className="font-bold text-emerald-600">{datum?.maxAvailability?.toFixed(2)}%</span>
      </p>
      <p className="mt-1 text-xs text-slate-500">{datum?.samples ?? 0} snapshots</p>
    </div>
  );
};

function AvailabilityRangeChart({ history = [] }) {
  const chartData = useMemo(() => toDailyAvailabilityRange(history), [history]);

  const allMinValues = chartData.map((item) => item.minAvailability);
  const allMaxValues = chartData.map((item) => item.maxAvailability);

  const lowerBound = chartData.length > 0
    ? Math.max(0, Math.floor((Math.min(...allMinValues) - 1.5) / 2) * 2)
    : 0;
  const upperBound = chartData.length > 0
    ? Math.min(100, Math.ceil((Math.max(...allMaxValues) + 1.5) / 2) * 2)
    : 100;

  const totalSamples = chartData.reduce((sum, item) => sum + item.samples, 0);

  return (
    <div className="card shadow-lg hover:shadow-xl transition-shadow">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-indigo-600">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Daily Availability Envelope</h3>
            <p className="text-sm text-slate-500">Lowest and highest availability captured each day</p>
          </div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          Last {chartData.length || 0} days
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
          No availability history yet.
        </div>
      ) : (
        <>
          <div className="h-80 rounded-xl border border-slate-100 bg-gradient-to-b from-slate-50 to-white p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 18, left: 0, bottom: 8 }}
                barCategoryGap="24%"
              >
                <defs>
                  <linearGradient id="dailyLowGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="dailyHighGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.8} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="4 6" stroke="#dbe2ea" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#334155', fontSize: 12, fontWeight: 600 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[lowerBound, upperBound]}
                  tick={{ fill: '#475569', fontSize: 12 }}
                  tickFormatter={(value) => `${value}%`}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#0f172a10' }} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ fontSize: '12px', paddingBottom: '12px' }}
                />
                <ReferenceLine y={99} stroke="#0ea5e9" strokeDasharray="5 5" ifOverflow="extendDomain" />
                <Bar
                  dataKey="minAvailability"
                  name="Daily Low"
                  fill="url(#dailyLowGradient)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="maxAvailability"
                  name="Daily High"
                  fill="url(#dailyHighGradient)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

export default AvailabilityRangeChart;