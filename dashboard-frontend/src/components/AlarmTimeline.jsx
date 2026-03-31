import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';
import clsx from 'clsx';

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
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (!Number.isNaN(Number(trimmed))) {
      return parseTimestamp(Number(trimmed));
    }

    const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(trimmed) ? trimmed : `${trimmed}Z`;
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

function AlarmTimeline({ alarms }) {
  const sortedAlarms = [...alarms]
    .sort((a, b) => {
      const aDate = parseTimestamp(a.lifecycle?.createdAt ?? a.lifecycle?.created_at ?? a.updatedAt ?? a.updated_at);
      const bDate = parseTimestamp(b.lifecycle?.createdAt ?? b.lifecycle?.created_at ?? b.updatedAt ?? b.updated_at);
      const aTime = aDate ? aDate.getTime() : 0;
      const bTime = bDate ? bDate.getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 10);

  const getSeverityColor = (severity) => {
    const colors = {
      CRITICAL: 'border-red-500 bg-red-50',
      HIGH: 'border-orange-500 bg-orange-50',
      MEDIUM: 'border-yellow-500 bg-yellow-50',
      LOW: 'border-blue-500 bg-blue-50'
    };
    return colors[severity] || 'border-gray-500 bg-gray-50';
  };

  const getSeverityDot = (severity) => {
    const colors = {
      CRITICAL: 'bg-red-500',
      HIGH: 'bg-orange-500',
      MEDIUM: 'bg-yellow-500',
      LOW: 'bg-blue-500'
    };
    return colors[severity] || 'bg-gray-500';
  };

  if (sortedAlarms.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Clock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg font-medium">No recent alarms</p>
        <p className="text-sm">System is operating normally</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500 via-purple-500 to-pink-500"></div>
      
      <div className="space-y-4">
        {sortedAlarms.map((alarm, index) => (
          <div key={alarm.alarmId || alarm.alarm_id || alarm.id || index} className="relative pl-12">
            {/* Timeline dot */}
            <div className={clsx(
              'absolute left-2.5 w-3 h-3 rounded-full border-2 border-white',
              getSeverityDot(alarm.severity)
            )}></div>
            
            {/* Alarm card */}
            <div className={clsx(
              'border-l-4 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow',
              getSeverityColor(alarm.severity)
            )}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="font-bold text-gray-900">{alarm.routeId}</span>
                    <span className={clsx('badge', 
                      alarm.severity === 'CRITICAL' ? 'badge-critical' :
                      alarm.severity === 'HIGH' ? 'badge-danger' :
                      alarm.severity === 'MEDIUM' ? 'badge-warning' :
                      'badge bg-blue-100 text-blue-800'
                    )}>
                      {alarm.severity}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{alarm.description}</p>
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>
                        {(() => {
                          const createdAt = parseTimestamp(alarm.lifecycle?.createdAt ?? alarm.lifecycle?.created_at ?? alarm.updatedAt ?? alarm.updated_at);
                          return createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : '-';
                        })()}
                      </span>
                    </span>
                    {alarm.alarmType && (
                      <span className="px-2 py-0.5 bg-gray-200 rounded-full">
                        {alarm.alarmType}
                      </span>
                    )}
                  </div>
                </div>
                
                {alarm.status === 'RESOLVED' ? (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                ) : alarm.status === 'ACKNOWLEDGED' ? (
                  <Clock className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 animate-pulse" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AlarmTimeline;
