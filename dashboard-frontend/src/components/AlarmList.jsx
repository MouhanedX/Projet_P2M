import { AlertCircle } from 'lucide-react';
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

  const handleAcknowledge = async (alarmId) => {
    if (!alarmId) {
      console.warn('Cannot acknowledge alarm without an identifier');
      return;
    }

    setProcessing(alarmId);
    try {
      await alarmsAPI.acknowledge(alarmId, {
        acknowledgedBy: 'operator'
      });
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Error acknowledging alarm:', error);
    } finally {
      setProcessing(null);
    }
  };

  if (alarms.length === 0) {
    return (
      <div className="flex justify-center">
        <div className="text-center py-12 text-gray-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium">No active alarms</p>
          <p className="text-sm">All systems operating normally</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <table className="w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Severity
            </th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Route
            </th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created Date & Time
            </th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Assign
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
            const lifecycle = alarm.lifecycle || {};
            const acknowledged = Boolean(lifecycle.acknowledged);
            const repairDuration = Number(lifecycle.repairDurationSeconds ?? lifecycle.repair_duration_seconds ?? 0);
            const canAcknowledge = !acknowledged && repairDuration > 0;

            return (
              <tr key={alarmIdentifier || alarm.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-center">
                  <span className={clsx('badge', getSeverityBadge(alarm.severity))}>
                    {alarm.severity}
                  </span>
                </td>
                <td className="px-6 py-4 text-center text-sm font-medium text-gray-900">
                  {routeId}
                </td>
                <td className="px-6 py-4 text-center text-sm text-gray-500">
                  {alarmType}
                </td>
                <td className="px-6 py-4 text-center text-sm text-gray-500">
                  {createdAtDate ? createdAtDate.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}
                </td>
                <td className="px-6 py-4 text-center text-sm text-gray-500">
                  {acknowledged ? (
                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                      Assigned
                    </span>
                  ) : canAcknowledge ? (
                    <button
                      onClick={() => handleAcknowledge(alarmIdentifier)}
                      disabled={processing === alarmIdentifier}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {processing === alarmIdentifier ? 'Assigning...' : 'Assign'}
                    </button>
                  ) : (
                    <span className="text-slate-400">-</span>
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
