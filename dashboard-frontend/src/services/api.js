import axios from 'axios';

const EMS_API_URL = import.meta.env.VITE_EMS_API_URL || 'http://localhost:8080/api';
const RTU_API_URL = import.meta.env.VITE_RTU_API_URL || 'http://localhost:8001/api';

// EMS Backend API
const emsApi = axios.create({
  baseURL: EMS_API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// RTU Emulator API (Multi-RTU)
const rtuApi = axios.create({
  baseURL: RTU_API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// RTUs API - Get all RTUs from database via RTU Emulator
export const rtusAPI = {
  getAll: () => rtuApi.get('/rtus'),
  getStatus: (rtuId) => rtuApi.get(`/rtu/${rtuId}/status`),
  getRoutes: (rtuId) => rtuApi.get(`/rtu/${rtuId}/routes`),
  getRouteDetails: (rtuId, routeId) => rtuApi.get(`/rtu/${rtuId}/routes/${routeId}`),
  startMonitoring: (rtuId) => rtuApi.post(`/rtu/${rtuId}/start`),
  stopMonitoring: (rtuId) => rtuApi.post(`/rtu/${rtuId}/stop`),
  testRoute: (rtuId, routeId) => rtuApi.post(`/rtu/${rtuId}/test/${routeId}`)
};

// Alarms API - From EMS Backend
export const alarmsAPI = {
  getAll: (params) => emsApi.get('/alarms', { params }),
  getActive: () => emsApi.get('/alarms/active'),
  getById: (id) => emsApi.get(`/alarms/${id}`),
  getByRoute: (routeId) => emsApi.get(`/alarms/route/${routeId}`),
  getByRtu: (rtuId) => emsApi.get(`/alarms/rtu/${rtuId}`),
  resolve: (id, data) => emsApi.post(`/alarms/${id}/resolve`, data),
  getStatistics: () => emsApi.get('/alarms/statistics')
};

// KPIs API - From EMS Backend
export const kpisAPI = {
  getNetworkHealth: () => emsApi.get('/kpis/network-health'),
  getLatest: (kpiType) => emsApi.get(`/kpis/latest/${kpiType}`),
  getHistory: (params) => emsApi.get('/kpis/history', { params }),
  triggerCalculation: () => emsApi.post('/kpis/calculate')
};

// Routes API - From EMS Backend
export const routesAPI = {
  getAll: () => emsApi.get('/routes'),
  getById: (id) => emsApi.get(`/routes/${id}`),
  getByRtu: (rtuId) => emsApi.get(`/routes/rtu/${rtuId}`)
};

// OTDR Tests API - From EMS Backend
export const otdrAPI = {
  getRecent: (limit = 20, routeId) =>
    emsApi.get('/otdr-tests/recent', { params: { limit, routeId } })
};

export { emsApi, rtuApi };
