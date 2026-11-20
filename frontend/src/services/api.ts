export interface TelemetryEventItem {
  id: number;
  app_id: string;
  event_type: string;
  visitor_id: string;
  user_email?: string | null;
  path?: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface FutmadUserItem {
  id: number;
  email: string;
  name?: string | null;
  auth_provider: string;
  created_at?: string | null;
  last_login_at?: string | null;
  access_count_14d?: number;
}

export interface RegisteredUserDayDetail {
  email: string;
  name?: string | null;
  count: number;
}

export interface RegisteredUserAccessSummary {
  email: string;
  name?: string | null;
  access_count: number;
}

export interface DailyAccessItem {
  date: string;
  anonymous_accesses: number;
  registered_accesses: number;
  new_registrations: number;
  anonymous_unique: number;
  registered_unique: number;
  registered_users_detail?: RegisteredUserDayDetail[];
  total_accesses: number;
}

export interface DokployContainerItem {
  name: string;
  state: string;
  status: string;
  cpu_percent?: number | null;
  memory_mb?: number | null;
  memory_limit_mb?: number | null;
  memory_percent?: number | null;
}

export interface RaspberryMetrics {
  available: boolean;
  cpu_percent?: number | null;
  cpu_cores?: number | null;
  load_1m?: number | null;
  ram_used_mb?: number | null;
  ram_total_mb?: number | null;
  ram_percent?: number | null;
  temperature_c?: number | null;
  uptime_formatted?: string | null;
  fan_detected?: boolean;
  fan_active?: boolean | null;
  fan_rpm?: number | null;
  fan_level?: number | null;
  fan_status?: string;
}

export interface DokployServiceItem {
  id: string;
  name: string;
  kind: string;
  status: string;
}

export interface DokployProjectItem {
  project_id: string;
  name: string;
  description: string;
  services: DokployServiceItem[];
}

export interface DashboardOverview {
  generated_at: string;
  global_kpis: {
    total_registered_users: number;
    active_users_24h: number;
    unique_visitors_24h: number;
    total_events_logged: number;
    errors_24h: number;
  };
  dokploy: {
    connected: boolean;
    error?: string;
    projects: DokployProjectItem[];
    containers_running: number;
    containers_total: number;
    total_cpu_percent?: number;
    total_memory_mb?: number;
    containers: DokployContainerItem[];
  };
  raspberry?: RaspberryMetrics;
  futmad: {
    registered_users_total: number;
    active_users_24h: number;
    favorite_teams_total: number;
    favorite_campos_total: number;
    unique_visitors_total: number;
    unique_visitors_24h: number;
    sessions_total: number;
    events_by_type: Record<string, number>;
    daily_accesses: DailyAccessItem[];
    registered_user_accesses?: RegisteredUserAccessSummary[];
    users: FutmadUserItem[];
    recent_events: TelemetryEventItem[];
  };
  georisk: {
    unique_visitors_total: number;
    unique_visitors_24h: number;
    page_views_total: number;
    property_searches_total: number;
    unlock_clicks_total: number;
    unlock_by_plan: Record<string, number>;
    errors_total: number;
    events_by_type: Record<string, number>;
    recent_errors: TelemetryEventItem[];
    recent_events: TelemetryEventItem[];
  };
}

const TOKEN_KEY = 'homelab_pulse_admin_token';

export function resolveApiBaseUrl(
  envUrl?: string,
  browserOrigin?: string,
  isDev = false
): string {
  const cleanEnv = (envUrl ?? '').trim();
  if (cleanEnv) return cleanEnv.replace(/\/$/, '');
  if (!isDev && browserOrigin && /^https?:\/\//.test(browserOrigin)) {
    return browserOrigin.replace(/\/$/, '');
  }
  return 'http://localhost:8000';
}

function getBaseUrl(): string {
  return resolveApiBaseUrl(
    (import.meta as any).env?.VITE_API_URL,
    typeof window !== 'undefined' ? window.location.origin : undefined,
    Boolean((import.meta as any).env?.DEV)
  );
}

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export async function verifyPin(pin: string): Promise<string> {
  const res = await fetch(`${getBaseUrl()}/api/auth/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: pin.trim() }),
  });

  if (!res.ok) {
    let msg = 'PIN incorrecto.';
    try {
      const data = await res.json();
      if (data?.detail) msg = String(data.detail);
    } catch {
      // keep default
    }
    throw new Error(msg);
  }

  const data = await res.json();
  setStoredToken(data.access_token);
  return data.access_token;
}

export async function fetchDashboardOverview(token: string): Promise<DashboardOverview> {
  const res = await fetch(`${getBaseUrl()}/api/dashboard/overview`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      setStoredToken(null);
    }
    throw new Error(`Error HTTP ${res.status}`);
  }

  return await res.json();
}
