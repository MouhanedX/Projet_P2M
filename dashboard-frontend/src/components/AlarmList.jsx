import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { alarmsAPI } from '../services/api';
import { useState } from 'react';
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

  if (typeof value === 'object') {
    if (typeof value.epochSecond === 'number') {
      const nanos = typeof value.nano === 'number' ? value.nano : 0;
      const millis = (value.epochSecond * 1000) + Math.floor(nanos / 1000000);
      const date = new Date(millis);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (Object.prototype.hasOwnProperty.call(value, '$date')) {
      return parseTimestamp(value.$date);
    }
  }

  return null;
};

function AlarmList({ alarms, onRefresh }) {
  const [processing, setProcessing] = useState(null);

  const getSeverityBadge = (severity) => {
    const badges = {
      CRITICAL: 'badge-critical',
      HIGH: 'badge-danger',
      MEDIUM: 'badge-warning',
      LOW: 'badge bg-blue-100 text-blue-800'
    };
    return badges[severity] || 'badge';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'RESOLVED':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const handleResolve = async (alarmId) => {
    if (!alarmId) {
      console.warn('Cannot resolve alarm without an identifier');
      return;
    }

    setProcessing(alarmId);
    try {
      await alarmsAPI.resolve(alarmId, {
        resolvedBy: 'operator',
        resolutionNotes: 'Resolved from dashboard'
      });
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Error resolving alarm:', error);
    } finally {
      setProcessing(null);
    }
  };

  if (alarms.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg font-medium">No active alarms</p>
        <p className="text-sm">All systems operating normally</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Severity
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Route
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Description
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {alarms.map((alarm) => {
            const alarmIdentifier = alarm.alarmId || alarm.alarm_id || alarm.id;
            const routeId = alarm.routeId || alarm.route_id || '-';
            const alarmType = alarm.alarmType || alarm.alarm_type || '-';
            const createdAtValue = alarm.lifecycle?.createdAt ?? alarm.lifecycle?.created_at ?? alarm.updatedAt ?? alarm.updated_at;
            const createdAtDate = parseTimestamp(createdAtValue);

            return (
              <tr key={alarmIdentifier || alarm.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusIcon(alarm.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={clsx('badge', getSeverityBadge(alarm.severity))}>
                    {alarm.severity}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {routeId}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {alarmType}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 max-w-md truncate">
                  {alarm.description}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {createdAtDate ? formatDistanceToNow(createdAtDate, { addSuffix: true }) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                  {alarm.status === 'ACTIVE' && (
                    <button
                      onClick={() => handleResolve(alarmIdentifier)}
                      disabled={!alarmIdentifier || processing === alarmIdentifier}
                      className="px-3 py-1 text-green-600 hover:text-green-800 hover:bg-green-50 font-medium disabled:opacity-50 rounded border border-green-300 hover:border-green-500"
                    >
                      {processing === alarmIdentifier ? 'Processing...' : 'Resolve'}
                    </button>
                  )}
                  {alarm.status === 'RESOLVED' && (
                    <span className="px-3 py-1 text-green-600 font-medium">✓ Resolved</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default AlarmList;
