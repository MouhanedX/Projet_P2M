import { TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';

function KpiCard({ title, value, unit = '', icon, subtitle, trend, color = 'blue', isInteger = false }) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    green: 'bg-green-50 border-green-200 text-green-600',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-600',
    red: 'bg-red-50 border-red-200 text-red-600'
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <div className="flex items-baseline space-x-2">
            <p className="text-3xl font-bold text-gray-900">
              {typeof value === 'number' ? (isInteger ? Math.round(value) : value.toFixed(1)) : value}
            </p>
            {unit && (
              <span className="text-sm text-gray-500 font-medium">{unit}</span>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
          {trend !== undefined && trend !== 0 && (
            <div className={clsx(
              'flex items-center space-x-1 mt-2',
              trend > 0 ? 'text-green-600' : 'text-red-600'
            )}>
              {trend > 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span className="text-sm font-medium">
                {Math.abs(trend).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        <div className={clsx('p-3 rounded-lg border', colorClasses[color])}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default KpiCard;
