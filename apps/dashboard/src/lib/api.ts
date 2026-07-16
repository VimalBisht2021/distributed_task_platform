const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  let token = null;
  if (typeof window !== "undefined") {
    token = localStorage.getItem("token");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API error: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export type JobDto = {
  jobId: string;
  status: string;
  retryCount: number;
  workerId?: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  events?: JobEventDto[];
};

export type JobEventDto = {
  id: string;
  jobId: string;
  eventType: string;
  createdAt: string;
  details?: Record<string, unknown>;
  workerId?: string;
};

export type WorkerDto = {
  workerId: string;
  status: string;
  capacity: number;
  currentLoad: number;
  startedAt: string;
};

export type SystemMetricsDto = {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  retrying: number;
};

export type WorkerMetricsDto = {
  workers: WorkerDto[];
  activeWorkers: number;
  totalCapacity: number;
  currentLoad: number;
  utilization: number;
};

export const api = {
  auth: {
    login: (payload: any) => fetchApi<any>("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
    register: (payload: any) => fetchApi<any>("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
    me: (token?: string) => fetchApi<any>("/auth/me", { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  },
  health: () => fetchApi<{ status: string }>("/health"),
  jobs: {
    list: () => fetchApi<JobDto[]>("/jobs"),
    get: (id: string) => fetchApi<JobDto>(`/jobs/${id}`),
    create: (payload: any) =>
      fetchApi<JobDto>("/jobs", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    retry: (id: string) =>
      fetchApi<JobDto>(`/jobs/${id}/retry`, {
        method: "POST",
      }),
  },
  metrics: {
    system: () => fetchApi<SystemMetricsDto>("/metrics/jobs"),
    workers: () => fetchApi<WorkerMetricsDto>("/metrics/workers"),
  },
  events: {
    recovery: () => fetchApi<JobEventDto[]>("/events/recovery"),
  },
};
