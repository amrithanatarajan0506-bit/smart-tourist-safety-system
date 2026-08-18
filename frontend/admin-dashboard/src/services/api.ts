import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';

// Create axios instance
const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if it exists
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle token expiration
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  digitalId: string;
  createdAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  token?: string;
  user?: User;
  users?: User[];
  count?: number;
  demo?: boolean;
  stats?: AlertStats;
  alerts?: EmergencyAlert[];
}

export interface AlertStats {
  totalAlerts: number;
  activeAlerts: number;
  resolvedAlerts: number;
  lastAlert: EmergencyAlert | null;
}

export interface EmergencyAlert {
  alertId: string;
  userId: string;
  digitalId: string;
  type: string;
  emergencyType?: string;
  priority?: string;
  location: {
    latitude: number;
    longitude: number;
  };
  timestamp: string;
  status: string;
  message: string;
  resolvedAt?: string;
}

// API functions
export const apiService = {
  // Authentication
  login: async (credentials: LoginCredentials): Promise<ApiResponse<User>> => {
    const response = await apiClient.post('/auth/login', credentials);
    return response.data;
  },

  // Get current user profile
  getProfile: async (): Promise<ApiResponse<User>> => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  // Get all users/tourists
  getAllUsers: async (): Promise<ApiResponse<User[]>> => {
    const response = await apiClient.get('/auth/users');
    return response.data;
  },

  // Register new user (for admin use)
  registerUser: async (userData: {
    name: string;
    email: string;
    password: string;
    phone: string;
    role?: string;
  }): Promise<ApiResponse<User>> => {
    const response = await apiClient.post('/auth/register', userData);
    return response.data;
  },

  // Health check
  healthCheck: async (): Promise<any> => {
    const response = await apiClient.get('/health');
    return response.data;
  },

  // Alert management
  getAlertStats: async (): Promise<ApiResponse<AlertStats>> => {
    const response = await apiClient.get('/alerts/stats');
    return response.data;
  },

  getEmergencyAlerts: async (): Promise<ApiResponse<EmergencyAlert[]>> => {
    const response = await apiClient.get('/alerts/emergency');
    return response.data;
  },

  resolveAlert: async (alertId: string): Promise<ApiResponse<any>> => {
    const response = await apiClient.post(`/alerts/${alertId}/resolve`);
    return response.data;
  },

  // Socket stats
  getSocketStats: async (): Promise<any> => {
    const response = await apiClient.get('/socket/stats');
    return response.data;
  },
};

// ---- New: Trip / Location / Geofence / Incident / Dashboard / Ledger APIs ----

export interface Zone {
  _id: string;
  name: string;
  description?: string;
  zoneType: 'SAFE' | 'RESTRICTED' | 'RISK';
  geometry: {
    type: 'Circle' | 'Polygon';
    center?: { coordinates: [number, number] };
    radiusMeters?: number;
    polygon?: { coordinates: number[][][] };
  };
  warningDistanceMeters: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Incident {
  _id: string;
  eventType: 'GEOFENCE_WARNING' | 'GEOFENCE_VIOLATION' | 'SOS' | 'AI_RISK' | 'LOW_BATTERY' | 'OFFLINE' | 'LOCATION_SYNCED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'NEW' | 'ACKNOWLEDGED' | 'RESPONDING' | 'RESOLVED';
  priorityScore?: number;
  priorityLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendedAction?: string;
  tourist: { _id: string; name: string; digitalId: string; phone: string } | string;
  zone?: { _id: string; name: string; zoneType: string };
  location?: { coordinates: [number, number] };
  message?: string;
  details?: any;
  createdAt: string;
}

export interface TouristStatusRow {
  tripId: string;
  tourist: { _id: string; name: string; digitalId: string; phone: string };
  zoneStatus: 'SAFE' | 'WARNING' | 'VIOLATION' | 'UNKNOWN';
  locationState: 'LIVE' | 'LAST_KNOWN' | 'OFFLINE' | 'UNKNOWN';
  lastLocation: { coordinates: [number, number]; timestamp: string } | null;
  startedAt: string;
  pointCount: number;
}

export const zoneService = {
  list: async (): Promise<{ success: boolean; zones: Zone[] }> => (await apiClient.get('/zone')).data,
  create: async (zone: Partial<Zone>) => (await apiClient.post('/zone', zone)).data,
  update: async (id: string, zone: Partial<Zone>) => (await apiClient.put(`/zone/${id}`, zone)).data,
  setStatus: async (id: string, status: 'ACTIVE' | 'INACTIVE') =>
    (await apiClient.patch(`/zone/${id}/status`, { status })).data,
  remove: async (id: string) => (await apiClient.delete(`/zone/${id}`)).data,
};

export const incidentService = {
  list: async (params?: Record<string, string>): Promise<{ success: boolean; incidents: Incident[] }> =>
    (await apiClient.get('/incident', { params })).data,
  acknowledge: async (id: string, note?: string) => (await apiClient.post(`/incident/${id}/acknowledge`, { note })).data,
  respond: async (id: string, note?: string) => (await apiClient.post(`/incident/${id}/respond`, { note })).data,
  resolve: async (id: string, note?: string) => (await apiClient.post(`/incident/${id}/resolve`, { note })).data,
};

export interface SafetySummary {
  tourist: { _id: string; name: string; digitalId: string; phone: string } | null;
  tripId: string;
  safetyStatus: 'SAFE' | 'ATTENTION_REQUIRED' | 'CRITICAL';
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  locationStatus: 'LIVE' | 'LAST_KNOWN' | 'OFFLINE' | 'UNKNOWN';
  lastUpdatedAt: string | null;
  contributingFactors: string[];
  recommendedAction: string;
  activeIncidentCount: number;
  activeIncidents: { eventType: string; severity: string; message: string; createdAt: string }[];
}

export const dashboardService = {
  overview: async () => (await apiClient.get('/dashboard/overview')).data,
  tourists: async (): Promise<{ success: boolean; tourists: TouristStatusRow[] }> =>
    (await apiClient.get('/dashboard/tourists')).data,
  safetySummary: async (): Promise<{ success: boolean; summaries: SafetySummary[] }> =>
    (await apiClient.get('/dashboard/safety-summary')).data,
};

export const ledgerService = {
  verify: async () => (await apiClient.get('/ledger/verify')).data,
};

export default apiService;
