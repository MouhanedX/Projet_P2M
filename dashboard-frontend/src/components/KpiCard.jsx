import { TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';

function KpiCard({
  title,
  value,
  unit = '',
  icon,
  subtitle,
  trend,
  color = 'blue',
  isInteger = false,
  compact = false,
}) {
  const toneClasses = {
    blue: {
      surface: 'from-sky-50/80 via-white to-indigo-50/70',
      glow: 'bg-sky-300/20',
      icon: 'bg-blue-50 border-blue-200 text-blue-600',
    },
    green: {
      surface: 'from-emerald-50/80 via-white to-cyan-50/70',
      glow: 'bg-emerald-300/25',
      icon: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    },
    yellow: {
      surface: 'from-amber-50/80 via-white to-yellow-50/70',
      glow: 'bg-amber-300/25',
      icon: 'bg-amber-50 border-amber-200 text-amber-600',
    },
    red: {
      surface: 'from-rose-50/80 via-white to-orange-50/70',
      glow: 'bg-rose-300/25',
      icon: 'bg-rose-50 border-rose-200 text-rose-600',
    },
  };

  const tone = toneClasses[color] || toneClasses.blue;
  const hasNumericValue = typeof value === 'number' && Number.isFinite(value);
  const valueText = hasNumericValue
    ? (isInteger ? Math.round(value).toLocaleString() : value.toFixed(1))
    : value;
  const hasTrend = typeof trend === 'number' && Number.isFinite(trend) && trend !== 0;
  const trendIsPositive = hasTrend ? trend > 0 : false;

  return (
    <div className={clsx(
      'relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br shadow-2xl shadow-slate-400/45',
      compact ? 'p-4' : 'p-5',
      tone.surface
    )}>
      <div className={clsx('pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl', tone.glow)} />
      <div className="pointer-events-none absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-white/40 blur-2xl" />

      <div className={clsx('absolute rounded-xl border backdrop-blur-sm', tone.icon, compact ? 'right-4 top-4 p-2' : 'right-5 top-5 p-2.5')}>
        {icon}
      </div>

      <div className={clsx('relative flex h-full flex-col', compact ? 'min-h-[136px]' : 'min-h-[170px]')}>
        <div className={compact ? 'pr-14' : 'pr-16'}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
        </div>

        <div className="mt-4 flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex items-end justify-center gap-2">
            <p className={clsx('font-black leading-none tracking-tight text-slate-900', compact ? 'text-5xl' : 'text-6xl')}>
              {valueText}
            </p>
            {unit && (
              <span className={clsx('pb-1 font-semibold text-slate-500', compact ? 'text-lg' : 'text-xl')}>{unit}</span>
            )}
          </div>

          {subtitle && (
            <p className={clsx('mt-3 text-slate-500', compact ? 'text-base' : 'text-lg')}>{subtitle}</p>
          )}

          {hasTrend && (
            <div className={clsx(
              'mt-4 inline-flex items-center gap-1 rounded-full border font-semibold',
              compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
              trendIsPositive
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            )}>
              {trendIsPositive ? (
                <TrendingUp className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              ) : (
                <TrendingDown className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              )}
              <span>{Math.abs(trend).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default KpiCard;
